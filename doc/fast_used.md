# 快速上手
这篇文档将粗略概述插件的基本内容

## 安装插件

通过[koishi插件市场](https://koishi.chat/zh-CN/market/)安装

## 配置

### 基础设置
| 配置项 | 类型 | 默认值 | 说明 | 启用条件 |
|--------|------|--------|------|---------|
| **check_jf_command_set** | boolean | true | 启用积分查询指令 | 始终可用 |
| **check_jf_command** | string | `你的积分是{jf}` | 查询响应模板 | check_jf_command_set=true |

### 日志设置
| 配置项 | 类型 | 默认值 | 说明 | 启用条件 |
|--------|------|--------|------|---------|
| **log** | boolean | true | 启用日志系统 | 始终可用 |
| **only_success** | boolean | true | 仅记录成功操作 | log=true |
| **max_log** | number | 100 | 最大日志存储量（≥5） | log=true |
| **log_type** | string[] | `['add','reduce']` | 记录的操作类型：<br>`get`-查询 `set`-设置<br>`add`-增加 `reduce`-减少 | log=true |

## 用户指令
- 查询积分：`查询积分`
  示例响应：`🏅 当前积分：1580`

## 开发者调用


对于所有api，返回值均为下列格式：
```typescript
interface ApiResponse {
  code: number 
  // 状态码，类似于http状态码，200为成功，4xx为调用方错误，5xx为服务错误
  msg: string 
  // 信息，在错误时将返回错误信息
  data?: any 
  // 可选，当为取值型api时将返回对应的值
}
```
使用实例：
```typescript
import { } from 'koishi-plugin-codegang-jf'

export const name = 'my-plugin'
export const inject = {
  required: ['jf']
}

export function apply(ctx: Context) {
  ctx.command('test').action(async ({ session }) => {
    ctx.jf.add(userId, 100, name)// 增加积分
    ctx.jf.get(userId, name)
    ctx.jf.getTopUsers(10, name)// 获取积分榜上TOP10用户
  });
}

```

## 日志查询与数据回滚

正在开发相关插件。目前您可以使用[koishi-plugin-dataview](https://github.com/koishijs/koishi-plugin-dataview)，选择`codegang-jf-log`数据表查看保存的日志


## ⚠️ **注意事项**
1. 确保已安装数据库支持 (`database` 服务)
2. 积分值支持整数类型
3. 日志系统采用循环覆盖策略
4. 批量操作建议添加事务处理
5. 建议定期备份数据库文件，防止因崩溃导致的