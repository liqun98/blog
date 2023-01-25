---
title: MIT 6.S081 Lab3 Page Tables
date: 2022-03-17 15:18:22
tags: ['操作系统', '学习']
draft: false
summary: 'MIT操作系统课程学习Lab记录3'
---

这一章的实验主要让我们熟悉计算机是如何通过虚拟地址找到物理地址的，通过多级页表的方式，对虚拟地址进行多层解析，得到实际需要的物理地址。

## Speed up system calls

第一个实验要求我们在用户空间和 kernel 之前分享一些内存，以加速系统调用的过程，这些系统调用就不需要通过切换到内核态的方式来进行调用了。实验要求我们映射 USYSCALL(kernel/memlayout.h)的虚拟地址，所以我们首先要给给这个虚拟地址分配一个实际的物理地址。

在 allocproc(kernel/proc.c)函数中，我们可以调用 kalloc 函数来进行内存的分配。kalloc 可以分配当前空闲的内存页。

```c
static struct proc*
allocproc(void)
{
...
+if((p->usyscall = (struct usyscall *)kalloc()) == 0) {
    freeproc(p);
    release(&p->lock);
    return 0;
  }
  p->usyscall->pid = p->pid;
...
}
```

经过这一步 p->usyscall 已经指向了一个空的内存页了，并且保存了线程 p 的 pid。

下一步是在 proc_pagetable(kernel/proc.c)函数中进行映射，proc_pagetable 函数给线程创建了页表，用于转换虚拟地址到物理地址。mappages 可以将 p->usyscall 的实际物理地址映射到 USYSCALL 指定的虚拟地址上去。

```c
pagetable_t
proc_pagetable(struct proc *p){
...
  +if(mappages(pagetable, USYSCALL, PGSIZE,
              (uint64)(p->usyscall), PTE_R | PTE_U) < 0){
    uvmunmap(pagetable, TRAMPOLINE, 1, 0);
    uvmunmap(pagetable, TRAPFRAME, 1, 0);
    uvmfree(pagetable, 0);
    return 0;
  }
...
}
```

在之后我们还需要对一些释放线程时做一些处理，保证这片内存也被释放出去。

```c
void
proc_freepagetable(pagetable_t pagetable, uint64 sz)
{
  ...
  + uvmunmap(pagetable, USYSCALL, 1, 0);
  ...
}


static void
freeproc(struct proc *p)
{
  ...
  if (p->usyscall) kfree((void *)p->usyscall);
    p->usyscall = 0;
  p->usyscall = 0;
  ...
}
```

同时因为我们给线程新增了一个属性，所以也要对线程结构进行更改。

```c
struct proc {
+  struct usyscall * usyscall;
}
```

## Print a page table

第二个实验需要我们打印出第一个线程的页表结构，每一个标记有效的线程我们都需要将他们打印出来。大概的方法就是拿到根页表之后进行遍历，可以参考 walk 方法。

首先我们给 exec.c 中的 exec 添加上对我们方法的调用。

```c
int
exec(char *path, char **argv){
...
+ if(p->pid == 1){
    vmprint(p->pagetable);
  }
...
}
```

之后在 vm.c 中定义函数。

```c
void
vmprintfunc(pagetable_t pagetable, int level)
{
  for (int i = 0;i < 512;i++) {
    pte_t *pte = &pagetable[i];
    if(*pte & PTE_V) {
      for (int j = 0;j < level;j++) {
        printf("..");
        if (j != level - 1) {
          printf(" ");
        }
      }
      pagetable_t pa = (pagetable_t)PTE2PA(*pte);
      printf("%d: pte %p pa %p\n", i, *pte, pa);
      if ((*pte & (PTE_R | PTE_W | PTE_X)) == 0) {
        vmprintfunc(pa, level + 1);
      }
    }
  }
}

void
vmprint(pagetable_t pagetable)
{
  printf("page table %p\n", pagetable);
  vmprintfunc(pagetable, 1);
}
```

## Detecting which pages have been accessed

第三个实验要求我们查看哪些内存页有被接触到，实现一个系统调用，接受三个参数。第一个参数是用户页面的起始虚拟地址，第二个参数是需要检查页数，第三个参数是一个数字掩码，通过每一位是 0 或 1 判断内存页是否有接触。

在 sysproc.c 中实现函数，并且在 riscv.h 中定义 PTE_A 为 (1L << 6)。

```c
uint64
sys_pgaccess(void)
{
  int start;
  uint64 mask = 0;
  uint64 rp;
  int amout;
  struct proc *p = myproc();

  if(argint(0, &start) < 0) {
    return -1;
  }
  if(argint(1, &amout) < 0) {
    return -1;
  }
  if(argaddr(2, &rp) < 0) {
    return -1;
  }
  uint64 va;
  for (int i = 0;i < amout;i++) {
    va = start + (1 << 12) * i;
    pte_t * pte = walk(p->pagetable, va, 0);
    if(pte != 0 && ((*pte) & PTE_A)) {
      mask |= (1 << i);
      *pte -= PTE_A;
    }
  }

  if(copyout(p->pagetable, rp, (char *)&mask, sizeof(mask)) < 0) {
    return -1;
  }

  return 0;
}
```
