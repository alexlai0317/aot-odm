import { defineConfig } from 'vite';

// GitHub Pages 的專案網站會部署在 https://帳號.github.io/repo名稱/ 這個子路徑下，
// 靜態資源路徑必須加上 repo 名稱當前綴，不然圖片/JS 會抓錯路徑（本機開發維持根目錄不受影響）。
// 本機資料夾跟程式碼內部已經全部改名叫 titan，但 GitHub 上的 repo 仍保留原本的
// 名稱 aot-odm（使用者決定不改），這裡要跟 repo 實際名稱一致，網址才會正確。
// 之後如果 repo 改名了，只要改這個常數就好。
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
