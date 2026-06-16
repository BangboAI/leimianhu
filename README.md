# My Tools - 工具集

所有工具都在这个项目里，部署到 Vercel 后通过域名访问。

## 部署方法

### 方法一：拖拽部署（最简单）

1. 打开 [vercel.com](https://vercel.com)，用 GitHub 或邮箱注册
2. 点击 **Add New Project**
3. 点击 **Continue with** → 选择这个文件夹
4. 或者直接把整个 `my-tools` 文件夹拖进去
5. 点 **Deploy**，等 1 分钟
6. 部署完成！你会得到一个 `xxx.vercel.app` 地址

### 方法二：CLI 部署

```bash
# 安装 Vercel CLI
npm install -g vercel

# 进入项目目录部署
cd my-tools
vercel deploy
```

## 绑定域名

1. 在 Vercel 项目面板 → **Settings** → **Domains**
2. 输入你的域名（如 `tools.yourdomain.com`）
3. 按提示在 DNS 管理后台添加 CNAME 记录到 `cname.vercel-dns.com`
4. 等几分钟生效，HTTPS 自动配置

## 添加新工具

1. 把新的 HTML 文件放到 `my-tools/` 目录下
2. 在 `index.html` 的工具列表里加上链接
3. 重新部署即可

## 工具列表

- `tiktok-script-generator.html` - TikTok 带货脚本生成器
- `index.html` - 工具导航首页（下次部署时加上）
- `vercel.json` - Vercel 配置文件
- `OZON上架内容_Duryarhall_Crossbody_Bag.md` - OZON 上架参考
- `OZON_FBO发货流程指南.md` - OZON FBO 发货指南
