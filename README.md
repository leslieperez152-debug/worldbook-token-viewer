# 世界书 Token 查看器

用于 TauriTavern / SillyTavern 的第三方前端扩展。可以读取酒馆中已导入的所有世界书，选择一个后：

- 统计每个词条的 token 数
- 显示蓝灯（常量）词条的总 token
- 显示蓝灯 + 绿灯（已启用）词条的总 token
- 显示全部词条（含停用）的总 token
- 直接在查看器中编辑某个词条的内容并保存回世界书

## 安装

1. 关闭 TauriTavern。
2. 将本仓库文件夹 `worldbook-token-viewer` 放到 TauriTavern 的本地扩展目录：

   `data/default-user/extensions/`

   例如：

   `D:\software\scoop\apps\TauriTavern\current\data\default-user\extensions\worldbook-token-viewer`

3. 重新打开 TauriTavern，在扩展抽屉中找到 “世界书 Token 查看器”。

## 使用

### 界面方式

1. 打开扩展抽屉。
2. 点击 “打开查看器”。
3. 从下拉框选择一个世界书。
4. 点击 “计算 token”。
5. 在左侧列表中点击某个词条的 “编辑”，右侧会显示该词条内容。
6. 修改后点击 “保存到世界书”。

### 命令方式

在聊天输入框中输入：

```text
/wi-tokens
```

也可以直接指定：

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
- 编辑保存会直接写入酒馆对应的世界书 JSON 文件。