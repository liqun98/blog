---
title: MIT 6.S081 Lab2 System Call
date: 2022-03-14 14:21:10
tags: ['操作系统', '学习']
draft: false
summary: 'MIT操作系统课程学习Lab记录2'
---

第二个实验主要是新增两个系统调用，通过这个过程学习到 Xv6 系统是如何完成一次 system call。简单来说，系统调用就是处于 Kernel mode 才能执行的命令，那么每当用户发出这样的请求，就需要调用 ecall，将控制权转移到 kernel，之后再根据传入的参数判断具体是进行哪一个系统调用。在开始之前，实验书建议我们先阅读 xv6 book 的第二章。

## System call tracing

我们需要实现一个叫 trace 的系统调用，这个调用有一个形参，作为掩码，这个参数决定之后跟踪的系统调用。例如，为了跟踪 fork 系统调用，这个参数就应该设置为 1 {'<<'} SYS**fork，SYS**fork 是 fork 的系统调用编号。跟踪系统调用应该仅影响调用他的进程和它的子进程，不应该影响其他进程，总体来说应该是下面这样的效果。

```shell
$ trace 32 grep hello README
3: syscall read -> 1023
3: syscall read -> 966
3: syscall read -> 70
3: syscall read -> 0
$
$ trace 2147483647 grep hello README
4: syscall trace -> 0
4: syscall exec -> 3
4: syscall open -> 3
4: syscall read -> 1023
4: syscall read -> 966
4: syscall read -> 70
4: syscall read -> 0
4: syscall close -> 0
$
$ grep hello README
$
$ trace 2 usertests forkforkfork
usertests starting
test forkforkfork: 407: syscall fork -> 408
408: syscall fork -> 409
409: syscall fork -> 410
410: syscall fork -> 411
409: syscall fork -> 412
410: syscall fork -> 413
409: syscall fork -> 414
411: syscall fork -> 415
...
```

首先我们需要把 trace 这个系统调用在 user 空间上注册上，这一步需要我们更改 user.h 和 usys.pl，很简单的增加两行就可以。

```c
/user/user.h
+ int trace(int);
/user/usys.pl
+ entry("trace");
```

除了在用户空间进行注册外，我们还需要在 kernel 代码中添加我们的新功能。

```c
/kernel/syscall.h
+ #define SYS_trace  22
/kernel/syscall.c
+ extern uint64 sys_trace(void);
```

实际的方法写在/kernel/sysproc.c 文件中，argint 方法是 kernel 中读取用户空间调用时传入的参数，myproc 可以获得调用的进程，将 mask 值赋值到进程结构中的 mask 中去，这样在接下来线程执行系统调用时我们就能检查它的 mask 值。

```c
/kernel/sysproc.c
uint64
sys_trace(void)
{
  int mask;

  if(argint(0, &mask) < 0)
    return -1;
  struct proc *p = myproc();
  p->mask = mask;
  return 0;
}
```

进程结构中是没有 mask 的，所以我们需要手动添加一下。

```c
/kernel/proc.h
struct proc {
  struct spinlock lock;

  // p->lock must be held when using these:
  enum procstate state;        // Process state
  void *chan;                  // If non-zero, sleeping on chan
  int killed;                  // If non-zero, have been killed
  int xstate;                  // Exit status to be returned to parent's wait
  int pid;                     // Process ID

  // wait_lock must be held when using this:
  struct proc *parent;         // Parent process

  // these are private to the process, so p->lock need not be held.
  uint64 kstack;               // Virtual address of kernel stack
  uint64 sz;                   // Size of process memory (bytes)
  pagetable_t pagetable;       // User page table
  struct trapframe *trapframe; // data page for trampoline.S
  struct context context;      // swtch() here to run process
  struct file *ofile[NOFILE];  // Open files
  struct inode *cwd;           // Current directory
  char name[16];               // Process name (debugging)
+ uint64 mask;                 // Mask to trace
};
```

前面这两步帮助我们在进程结构中记录了 mask 值，下一步就是进行系统调用时对这个值进行检查，每次系统调用我们都需要调用的函数就是 syscall，所以我们直接修改这个函数。

```c
/kernel/syscall.c
+ static char *syscalls_name[] = {
[SYS_fork]    "fork",
[SYS_exit]    "exit",
[SYS_wait]    "wait",
[SYS_pipe]    "pipe",
[SYS_read]    "read",
[SYS_kill]    "kill",
[SYS_exec]    "exec",
[SYS_fstat]   "fstat",
[SYS_chdir]   "chdir",
[SYS_dup]     "dup",
[SYS_getpid]  "getpid",
[SYS_sbrk]    "sbrk",
[SYS_sleep]   "sleep",
[SYS_uptime]  "uptime",
[SYS_open]    "open",
[SYS_write]   "write",
[SYS_mknod]   "mknod",
[SYS_unlink]  "unlink",
[SYS_link]    "link",
[SYS_mkdir]   "mkdir",
[SYS_close]   "close",
[SYS_trace]   "trace",
[SYS_sysinfo] "sysinfo",
};


void
syscall(void)
{
  int num;
  struct proc *p = myproc();

  num = p->trapframe->a7;
  if(num > 0 && num < NELEM(syscalls) && syscalls[num]) {
    p->trapframe->a0 = syscalls[num]();
+   if ((p->mask & (1 << num)) != 0) {
+     printf("%d: syscall %s -> %d\n", p->pid, syscalls_name[num], p->trapframe->a0);
+   }
  } else {
    printf("%d %s: unknown sys call %d\n",
            p->pid, p->name, num);
    p->trapframe->a0 = -1;
  }
}
```

现在对于系统调用我们已经能够进行追踪了，但是还没有实现 fork 出得子线程也被追踪的功能，为了实现这个功能我们需要修改 fork 函数，让子进程复制父进程的 mask 参数。

```c
/kernel/proc.c
int
fork(void)
{
  int i, pid;
  struct proc *np;
  struct proc *p = myproc();

  // Allocate process.
  if((np = allocproc()) == 0){
    return -1;
  }

+ // Copy trace mask from parent to child.
+ np->mask = p->mask;
......
```

这样就完整实现了整个功能。

## Sysinfo

这个作业要求我们实现一个系统调用 sysinfo，用来收集有关运行时的系统信息。系统调用采用一个参数：指向结构 sysinfo 的指针（参见 kernel/sysinfo.h），内核应该填写这个结构的字段：freemem 字段应该设置为空闲内存的字节数，nproc 字段应该设置为状态未被使用的进程数。

像之前的 trace 调用一样，我们需要在 user 空间和 kernel 空间上对我们的函数进行注册，这个步骤就不赘述了。

分析这个需求，主要就是获得系统的两项信息然后填入用户传入指针所指的内存空间之中。所以可以分解为两步，第一步获取系统信息，第二步传入。第一步中关于 freemem 的获取需要我们自己写一个方法，可以参考 kalloc.c，然后将我们的方法写在这个文件中。

```c
/kernel/kalloc.c
uint64
get_freemem(void)
{
  struct run *r;
  uint64 res = 0;
  acquire(&kmem.lock);
  r = kmem.freelist;
  while (r) {
    res += PGSIZE;
    r = r->next;
  }
  release(&kmem.lock);
  return res;
}
```

获取状态设置为未被使用进程数的方法可以参考 proc.c 文件。

```c
/kernel/proc.c
uint64
get_nproc(void) {
  struct proc *p;
  uint64 res = 0;
  for(p = proc;p < &proc[NPROC];p++) {
    if (p->state != UNUSED) {
      res++;
    }
  }
  return res;
}
```

完成这两个方法之后我们就可以进行系统调用函数的编写。关于指针的数据传递可以参考 sys_fstat() (kernel/sysfile.c) 和 filestat() (kernel/file.c)学习如何使用 copyout()

```c
uint64
sys_sysinfo(void)
{
  uint64 st;
  struct sysinfo i;
  struct proc *p = myproc();

  if(argaddr(0, &st) < 0)
    return -1;
  i.freemem = get_freemem();
  i.nproc = get_nproc();
  if(copyout(p->pagetable, st, (char *)&i, sizeof(i)) < 0)
    return -1;
  return 0;
}
```

这样就完成了整个实验的需求了 😄
