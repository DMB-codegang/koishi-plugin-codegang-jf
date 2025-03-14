# koishi-plugin-codegang-jf

[![npm](https://img.shields.io/npm/v/koishi-plugin-codegang-jf?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-codegang-jf)

## 这是什么

专业的积分管理系统，为机器人开发者提供灵活可靠的积分操作和操作追踪能力，使开发者在需要简单的积分系统时无需调用数据库并允许其他插件共同管理。

## 核心特性

### 🔧 灵活的配置体系
- 可开关积分查询指令
- 自定义查询响应模板
- 多维度日志配置和操作管理

### 📊 低门槛的积分操作
- `get()` 精准查询
- `set()` 强制设置
- `add()` 积分增加
- `reduce()` 积分扣减

### 📝 智能的日志管理
- 循环覆盖机制防止数据膨胀
- 自动填充ID间隙优化存储
- 双重清理策略（超量删除&排序覆盖）

## 开发者支持
- [📃快速上手](./doc/fast_used.md)