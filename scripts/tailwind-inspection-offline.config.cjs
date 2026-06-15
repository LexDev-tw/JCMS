/** 僅供離線單檔建置：掃描勘驗模組 JSX，主題與 JCMS tailwind.config 對齊（不修改 JCMS 本體） */
const path = require('path');

module.exports = {
  content: [path.join(__dirname, '..', 'public', 'apps', 'inspection-layout-app.jsx')],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '"Noto Sans TC"', 'PingFang TC', 'Microsoft JhengHei', 'sans-serif'],
        serif: ['Inter', '"Noto Sans TC"', 'PingFang TC', 'Microsoft JhengHei', 'sans-serif'],
      },
      colors: {
        surface: '#FFFFFF',
        panel: '#F7F7F5',
        ink: { 900: '#111111', 600: '#666666', 400: '#999999', 100: '#EAEAEA' },
        accent: '#F05A28',
        warning: '#FCA311',
      },
      boxShadow: {
        subtle: '0 2px 8px 0 rgba(0, 0, 0, 0.04)',
        drawer: '-12px 0 40px 0 rgba(0, 0, 0, 0.06)',
        modal: '0 20px 60px -10px rgba(0, 0, 0, 0.15)',
      },
    },
  },
  plugins: [],
};
