---
title: "Hello, World"
description: "第一篇试水"
pubDate: 2025-08-27
tags: [astro, rss]
draft: false
---

# vibe coding 40 分钟完成了超酷的 stack

GPT-5 到底有多强？

我这里不说废话，这是我和它协作40分钟的结果。

代码应当在 GPLv3.0 下发布，但是我不方便建立 GitHub 仓库提供副本，所以许可证的文件请见：https://www.gnu.org/licenses/

提示词如下：

```prompt 1
让我们来写一个 Stack 类，用 C++ 23!
1. 使用 template <typename... Types> 配合 std::variant 和 std::visit 解决对齐和类型安全的问题
2. 支持标准库风格的迭代器
3. 使用 std::construct_at 和 std::destroy_at 手动管理对象存在周期，避免不必要的开销
4. 兼容 pmr 和 allocator，支持修改分配策略
5. 使用 concept 明确地定义相关的需求，避免模板天书
```

```prompt 2
做得非常棒，我们现在进行迭代：
1. 检查展开模板参数包的问题
[compiler log ...]
2. 除非必要，使用`and`、`or`等风格的逻辑运算符，不要使用老式C风格的逻辑运算符
3. 使用 Doxygen 风格的注释，可以详细地说明；注释信息中英双语
4. 考虑到日常使用，应该在合适的位置设置好默认参数，并且尽可能地让模板参数能够自行推导
```

```prompt 3
别急，来修 bug！
[compiler log ...]
这次更新，我们迭代这几个：
1. 引入 noexcept(move) 颗粒度的更细异常保证
2. 提供 small_buffer 小对象优化版本
3. 加强可行范围内的 static reflection，对基础类型和对齐可解决的小类型进行优化
```

```prompt 4
维持设计需求不变（也就是已有的设计语义约束），我们来修 Bug：
[compiler log ...]
```

```prompt 5
嗯，我觉得很不错，你很棒！
接下来的任务：生成一份测试代码，饱和性质地测试一遍我们的 stack；只写在 main 函数中。
```

```prompt 6
嗯，你的测试代码有问题，修复一下bug：
[compiler log ...]
```
