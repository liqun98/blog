---
title: React diff导致的页面渲染bug
date: 2022-08-13 00:11:35
tags: ['react']
draft: false
summary: '实践中验证react diff原理'
---

在之前的学习过程中，我有学习很多 react 原理知识，很多原理对于开发的帮助没有想象中大，但是在实际开发中碰到的一个 bug，让我意识到对于原理的学习还是很重要的，能够帮助我们更快的定位问题，解决 bug。
问题的背景是这样的，在开发的联调过程中，后端发现数据查询页的表格，会偶尔出现数据错乱的情况，表格显示的数据和接口返回的数据不一致，于是拉着我排查这个问题。首先这不是一个每次点击翻页都会触发的问题，属于偶现 bug，所以我先尝试复现了出现问题的场景，经过一系列操作之后，我发现表格的前两项和接口中不一致，这两个数据像凭空冒出来的一样。不过这些数据也有些特别，它们的 Id 值都为 0，这让我感到很奇怪，Id 应该是一个唯一的数据，为何会出现相同的情况呢。向后端询问后了解到我们的数据 Id 并不唯一，有一类数据 Id 统一为 0，这时候我大概猜到了原因。查询前端代码，我发现这个表格的 rowKey 指定的就是 id，而 rowKey 是表格中每一项的 key 值，这个 key 值是给 React diff 过程中会用到的，React 会根据 key 来优化 diff 过程，**如果两次渲染中，同层级的节点会使用使用 tag（标签名）和 key 识别节点，区分出前后的节点是否变化，以达到尽量复用无变化的节点。** 在我们这个场景下，表格在上一页存在多个相同 id 值的项，重渲染过程中去除掉第一个 key 为 0 的节点后会认为已经达到 diff 目的了，所以保留了后续 key 为 0 的节点。
![diff过程](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/83a71d590dce4999a0320e7d7ba7bacd~tplv-k3u1fbpfcp-zoom-in-crop-mark:3024:0:0:0.awebp)
React 的 diff 基于两个假设：
1、相同类型的节点结构是相似的，不同类型的节点结构是不同的，当节点类型不同时会直接将原节点删除，并添加新节点
2、通过 key props 来暗示哪些子元素在不同的渲染下能保持稳定，如果节点类型和 key 都一样，就认为在两次渲染中此节点没有改变，可以复用

下面的 codesandbox 里面写的[demo](https://codesandbox.io/s/mutable-paper-8mgf88?file=/demo.tsx)，复现这个 bug，提醒自己还是要继续对 react 原理保持学习。

```typescript
import '@arco-design/web-react/dist/css/arco.css'

import React from 'react'
import { Table, TableColumnProps } from '@arco-design/web-react'

const columns: TableColumnProps[] = [
  {
    title: 'Name',
    dataIndex: 'name',
  },
  {
    title: 'Salary',
    dataIndex: 'salary',
  },
  {
    title: 'Address',
    dataIndex: 'address',
  },
  {
    title: 'Email',
    dataIndex: 'email',
  },
]
const data = [
  {
    key: '1',
    name: 'Jane Doe',
    salary: 23000,
    address: '32 Park Road, London',
    email: 'jane.doe@example.com',
  },
  {
    key: '1',
    name: 'Alisa Ross',
    salary: 25000,
    address: '35 Park Road, London',
    email: 'alisa.ross@example.com',
  },
  {
    key: '3',
    name: 'Kevin Sandra',
    salary: 22000,
    address: '31 Park Road, London',
    email: 'kevin.sandra@example.com',
  },
  {
    key: '4',
    name: 'Ed Hellen',
    salary: 17000,
    address: '42 Park Road, London',
    email: 'ed.hellen@example.com',
  },
  {
    key: '5',
    name: 'William Smith',
    salary: 27000,
    address: '62 Park Road, London',
    email: 'william.smith@example.com',
  },
]

const App = () => {
  return <Table columns={columns} data={data} pagination={{ pageSize: 2, total: 5 }} />
}

export default App
```
