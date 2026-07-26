import { defineConfig } from 'vite';

// GitHub Pages 的專案網站會部署在 https://帳號.github.io/repo名稱/ 這個子路徑下，
// 靜態資源路徑必須加上 repo 名稱當前綴，不然圖片/JS 會抓錯路徑（本機開發維持根目錄不受影響）。
// repo 名稱不是 aot-odm 的話，改這裡的 GITHUB_REPO_NAME 就好。
const GITHUB_REPO_NAME = 'aot-odm';

export default defineConfig(({ command }) => ({
  root: 'client',
  base: command === 'build' && process.env.GITHUB_PAGES ? `/${GITHUB_REPO_NAME}/` : '/',
  server: {
    port: 5174, // 跟 fps-1v1 的 5173 錯開，兩個專案可以同時開著
    host: true,
    allowedHosts: true,
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
}));
