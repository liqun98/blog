---
title: MIT 6.S081 Lab1
date: 2022-03-11 17:14:43
tags: ['操作系统', '学习']
draft: false
summary: 'MIT操作系统课程学习Lab记录1'
---

# MIT 6.S081 Lab1 Utilities

很久之前就想系统学习一下操作系统了，但是一直是停留于书本上，没有实际的实验操作。最近有空闲（摸鱼）时间，所以把尘封在 B 站收藏夹的 MIT 6.S081 课程拿出来学习。第一节课主要是介绍了 Xv6 系统以及看了一些 Xv6 中的一些系统调用的实现，看完第一节课也就可以做第一个 Lab 了。第一个 Lab 的主要内容是编写一些常用的系统调用。第一步要做的就是在官网安装 xv6 的系统，具体安装步骤官网上都有，安装完成之后 make qemu 就可以运行了。

## Sleep

第一个小 lab 是编写一个 sleep 系统调用，使用之后阻塞规定的时间，提示我们可以看看 echo.c、grep.c 的代码，这个还是比较简单，直接展示在下方。完成需求之后可以通过

**_./grade-lab-util sleep_**命令进行测试，之后的几个实验都可以通过这个方式进行测试。

```c
#include "kernel/types.h"
#include "kernel/stat.h"
#include "user/user.h"

int main(int argc, char *argv[])
{
    if (argc < 2)
    {
        fprintf(2, "Usage: sleep time\n");
        exit(1);
    }
    sleep(atoi(argv[1]));
    exit(0);
}
```

## Pingpong

第二个小 lab 是编写一个程序实现两个线程通过管道的方式通信，父线程传任意字符，子线程收到之后在标准输出打印 ping，并给父线程传回一个字符，父线程收到之后打印一个 pong。

xv6 中 read 是阻塞的，在成功读取之前是不会执行下面的语句的。

```c
#include "kernel/types.h"
#include "kernel/stat.h"
#include "user/user.h"

int main(int argc, char *argv[])
{
    int p[2];
    if(pipe(p) < 0){
      printf("pipe() failed\n");
      exit(1);
    }
    if (fork() == 0) {
        read(p[0],(int *) 0, 1);
        printf("%d: received ping\n", getpid());
        write(p[0], "x", 1);
    } else {
        write(p[1], "x", 1);
        wait((int *) 0);
        read(p[1], (int *) 0, 1);
        printf("%d: received pong\n", getpid());
    }
    exit(0);
}
```

## Primes

做这个实验之前先给了我们一份资料去阅读，关于多线程编程的历史发展。在这个实验中要解决的问题是通过多个线程加速素数的计算，第一个线程首先将能整除 2 的剔除，不能整除 2 传给下一个线程，下一个线程收到之后，又会以自己收到的第一个数作为底数，能整除的剔除，不能剔除的传递到下一个线程，循环往复这个过程直到没有收到新的数，整个流程如下图所示。

![sievegif](/static/images/sieve.gif)

写这个程序的过程中，最主要的是需要关注文件描述符的打开与关闭，当一个管道的中某一端全部的引用都被关闭时，从这个端口进行 read 读取的调用会收到 0 作为退出的标志。所以我们不能将端口一直打开，要在合适的时候进行关闭，否则无法从 read 读取中退出，并且 xv6 对于同时打开文件有限制，不能太大，如果一直不关是无法顺利 open 新的管道。具体的代码实现如下所示

```c
#include "kernel/types.h"
#include "kernel/stat.h"
#include "user/user.h"

void
childFunc(int * p) {
    int ft = 1;
    int * s = malloc(sizeof(int*));
    int base;
    int cp[2];
    int n;

    close(p[1]);
    while ( (n = read(p[0], s, sizeof(s))) > 0) {
        if (ft == 1) {
            printf("prime %d\n", *s);
            base = *s;
            ft = 0;
            if(pipe(cp) < 0){
                printf("pipe() failed\n");
                exit(1);
            }
            if (fork() == 0) {
                childFunc(cp);
            }
        } else {
            if (*s % base != 0) {
                write(cp[1], s, sizeof(s));
            }
        }
    }
    close(cp[0]);
    close(cp[1]);
    close(p[0]);
    wait(0);
    exit(0);
}

int main(int argc, char *argv[])
{
    int i;
    printf("2\n");
    int p[2];
    if(pipe(p) < 0){
      printf("pipe() failed\n");
      exit(1);
    }
    if (fork() == 0) {
        childFunc(p);
    } else {
        close(p[0]);
        for (i = 2;i <= 35;i++) {
            if (i % 2 != 0) {
                write(p[1], &i, sizeof(&i));
            }
        }
        close(p[1]);
        wait(0);
    }
    exit(0);
}
```

## Find

这个 lab 是让我们手动实现 find 系统调用，可以参考 ls 的代码来实现，要注意碰到. 和..时要跳过，否则会造成无穷递归。在这个代码的实现过程中，我也遇到了一些难解的 bug，先看代码，后面给大家复盘一下。

```c
#include "kernel/types.h"
#include "kernel/stat.h"
#include "user/user.h"
#include "kernel/fs.h"


char*
fmtname(char *path)
{
  static char buf[DIRSIZ+1];
  char *p;

  // Find first character after last slash.
  for(p=path+strlen(path); p >= path && *p != '/'; p--)
    ;
  p++;

  // Return blank-padded name.
  if(strlen(p) >= DIRSIZ)
    return p;
  memmove(buf, p, strlen(p));
  buf[strlen(p)] = 0;
  return buf;
}


void
find(char * path, char * target) {
    int fd;
    char buf[512], *p;
    struct stat st;
    struct dirent de;

    if ((fd = open(path, 0)) < 0) {
        fprintf(2, "find: cannot open %s\n", path);
        return;
    }

    if(fstat(fd, &st) < 0){
        fprintf(2, "find: cannot stat %s\n", path);
        close(fd);
        return;
    }

    switch (st.type) {
        case T_FILE:
            if (strcmp(target, fmtname(path)) == 0) {
                printf("%s\n", path);
            }
            break;
        case T_DIR:
            if(strlen(path) + 1 + DIRSIZ + 1 > sizeof buf){
                printf("find: path too long\n");
                break;
            }
            strcpy(buf, path);
            p = buf+strlen(buf);
            *p++ = '/';
            while(read(fd, &de, sizeof(de)) == sizeof(de)){
                // char next[512];
                if(de.inum == 0) {
                    continue;
                }
                if ((strcmp(de.name, ".") == 0) || (strcmp(de.name, "..") == 0)) {
                    continue;
                }
                memmove(p, de.name, DIRSIZ);
                p[DIRSIZ] = 0;
                // strcmp(next, buf);
                // find(next,target);
                find(buf, target);
            }
            break;
    }
    close(fd);
}


int main(int argc, char *argv[]) {
    if (argc < 3) {
        printf("Usage: find dir file");
    }
    find(argv[1], argv[2]);
    exit(0);
}
```

上面的代码有三行是经过我注释的，我的第一版代码就是这么写的，当时这样写是因为我觉得把 buf 直接传给下一层函数不太安全，可能会对这个指针内容进行更改，影响到后面的递归。这样写之后我本地测试了一下，在根目录下新建了文件 b 和 a/b，进行 find 调用也是没什么问题，两个文件都能找到。但是跑测试，每次都会报错，报错的内容大概就是内存地址错误。后面我 debug 的时候在 while 循环中和 find 的首行都进行了打印，发现每次都是在 a/c/b 这样的地方出错，而且 while 循环中的打印语句一直能输出，但是下一层 find 调用中的输出没有打印。这种错误在我看来并不常见，很少有自己调用自己出错的情况。于是我更改了测试条件，发现再多的二级目录都不会出错，但是只要有三级目录就会出错，这个时候我意识到了应该是函数的调用层数太多，导致内存爆了，而内存爆的原因很可能就是我声明的 512 字节的 next。仔细阅读代码之后我发现在 find 调用中其实对于传入实参的 buf，会有一个拷贝形参 path 的环节，所以不会影响到上一级中的 buf，所以这个 next 的声明是没什么必要的。当我把它注释掉之后，程序就顺利跑通了，为了验证我的想法，我把 next 的声明大小改为 100 字节，果然程序还是能够正常运行。

平时在自己的大内存系统上写代码习惯了（~~拥有太多不知道珍惜~~），没有意识到对于当年的计算机系统来说，512 个字节已经是很大的内存量。在编写底层 C 代码时，特别需要关心注重内存的使用，每一个字节都是那么的宝贵。

## Xargs

这个 lab 需要我们模仿 Unix 中的 xargs 调用，xargs 主要是通过上层管道传入的参数拼接上现有的参数，然后进行命令的执行，主要需要 fork 和 exec 调用实现这些功能，难点就是在于拼接多个参数。

```c
#include "kernel/types.h"
#include "kernel/stat.h"
#include "kernel/param.h"
#include "user/user.h"

int main(int argc, char * argv[]) {
    char * command = argv[1];
    char *args[MAXARG];
    int n = 0;
    char buf[512];
    int i;
    int arg_index = 0;
    for (i = 1;i < argc;i++) {
        args[arg_index++] = argv[i];
    }
    while ((n = read(0, buf, sizeof(buf))) != 0) {
        if (fork() == 0) {
            char arg[20];
            int index = 0;
            for (i = 0;i < n;i++) {
                if (buf[i] == ' ' || buf[i] == '\n' || i == n - 1) {
                    arg[index] = 0;
                    char tmp[20];
                    strcpy(tmp, arg);
                    index = 0;
                    args[arg_index++] = tmp;
                    printf("%s \n", tmp);
                    memset(arg, 0, 20);
                } else {
                    if (index >= 20) {
                        fprintf(2, "argv length must less than 20 char");
                        exit(1);
                    }
                    arg[index++] = buf[i];
                }
            }
            exec(command, args);
        } else {
            wait(0);
        }
    }
    exit(0);
}
```

在这个实验中，我注释的 printf 会打印出每次读取的数据，当读取的数据带换行时，read 每次都会先读取一个字符，这一点我感觉是系统调用 read 的问题，目前不影响使用。
