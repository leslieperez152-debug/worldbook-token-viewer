# Worldbook Token Counter

用于 TauriTavern / SillyTavern 的第三方前端扩展。读取酒馆中已导入的所有世界书，选择一个后统计：

- 每个词条的 token 数
- 蓝灯（常量）词条的总 token
- 蓝灯 + 绿灯（已启用）词条的总 token
- 全部词条（含停用）的总 token

## 安装

1. 关闭 TauriTavern。
2. 将本仓库文件夹 `worldbook-token-counter` 放到 TauriTavern 的本地扩展目录：

   `data/default-user/extensions/`

   例如：

   `D:\software\scoop\apps\TauriTavern\current\data\default-user\extensions\worldbook-token-counter`

3. 重新打开 TauriTavern，在扩展抽屉中找到 “Worldbook Token Counter”。

## 使用

### 界面方式

打开扩展抽屉，找到 “Worldbook Token Counter”：

1. 从下拉框选择一个世界书。
2. 点击 “统计 token”。
3. 在下方查看每个词条的蓝灯 / 绿灯 / 停用状态和 token 数，以及三类总量。

### 命令方式

在聊天输入框中输入：

```text
/wi-tokens
```

会弹出世界书选择器。也可以直接指定：

```text
/wi-tokens name=变身
```

或：

```text
/wi-tokens 变身
```

## 说明

- token 数使用酒馆当前选定的 tokenizer 计算，与酒馆自身的 token 统计保持一致。
- 蓝灯对应世界书词条的常量（Constant）激活方式；绿灯对应关键词触发等非常量激活方式。
