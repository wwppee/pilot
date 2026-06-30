# Pilot — pi.dev 的管理平面

> pi 跑活，Pilot 管 pi。

Pilot 是一个为 [pi.dev](https://pi.dev) 编码 agent 设计的**管理工具**（不是另一个 agent runtime）。它帮你：

- 📦 **管理 4624+ pi 包**：搜索、装卸、组合、冲突检测
- 💬 **管理会话**：列表、全文搜索、对比、统计
- 🎛 **管理 profile**：项目级 model/extension/thinking 切换
- 📊 **看消耗**：token、成本、按模型/扩展分维度
- 🔧 **做体检**：环境/配置/包/会话的健康检查

## 30 秒上手

```bash
# 装 Pilot
npm install -g pilot

# 确认环境
pilot doctor

# 搜包
pilot pack search subagent

# 看已装
pilot pack ls

# 全文搜会话
pilot session search "JWT auth"
```

## 为什么需要 Pilot？

pi 自己很极简——4 个原子工具（read / write / edit / bash），<1000 token system prompt。这让 pi 跑得快，但同时留下了 10 个管理缺口（[设计文档 §2.5](./PILOT.md)）。

Pilot **不替代 pi**，只管理 pi。`~/.pi/agent/` 永远是 source of truth。

## 命令一览（v0.1）

| 命令 | 说明 |
|---|---|
| `pilot pack ls` | 列出已装包，按用途分组 |
| `pilot pack search <query>` | 终端内搜 npm |
| `pilot pack info <pkg>` | 详情 |
| `pilot pack install <pkg>` | 装（包装 pi install） |
| `pilot pack team install <name>` | 装组合包 |
| `pilot session ls` | 列出本地会话 |
| `pilot session search <q>` | 全文搜会话 |
| `pilot doctor` | 体检 |

完整规划见 [PILOT.md](./PILOT.md)。

## 贡献

详见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

简单版：
1. Fork + clone
2. `npm install`
3. `npm run dev` 跑起来
4. 改代码
5. `npm test && npm run lint`
6. 提 PR

## License

[MIT](./LICENSE)