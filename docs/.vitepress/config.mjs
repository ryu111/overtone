import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Overtone',
  description: 'BDD 驅動的工作流自動化 Claude Code Plugin',
  lang: 'zh-TW',

  themeConfig: {
    nav: [
      { text: '現況', link: '/status' },
      { text: '規格文件', link: '/spec/overtone' },
      { text: 'Roadmap', link: '/roadmap/v1' }
    ],

    sidebar: [
      {
        text: '現況',
        items: [
          { text: '現況一覽', link: '/status' }
        ]
      },
      {
        text: '規格文件',
        items: [
          { text: '索引', link: '/spec/overtone' },
          { text: '架構', link: '/spec/overtone-架構' },
          { text: '工作流', link: '/spec/overtone-工作流' },
          { text: 'Agents', link: '/spec/overtone-agents' },
          { text: '並行', link: '/spec/overtone-並行' },
          { text: '子系統', link: '/spec/overtone-子系統' },
          { text: '驗證品質', link: '/spec/overtone-驗證品質' },
          { text: '架構圖', link: '/spec/workflow-diagram' }
        ]
      },
      {
        text: 'Roadmap',
        items: [
          { text: 'V1', link: '/roadmap/v1' }
        ]
      },
      {
        text: '參考文件',
        items: [
          { text: '措詞指南', link: '/reference/wording-guide' },
          { text: '並行缺陷分析', link: '/reference/parallel-defects' },
          {
            text: 'ECC 研究',
            collapsed: true,
            items: [
              { text: 'Agents', link: '/reference/ecc-agents' },
              { text: 'Hook 規則', link: '/reference/ecc-hooks-rules' },
              { text: '學習紀錄', link: '/reference/ecc-learning' },
              { text: '編排設計', link: '/reference/ecc-orchestration' },
              { text: '完整研究', link: '/reference/ecc-full-research' }
            ]
          }
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/ryu111/overtone' }
    ],

    search: {
      provider: 'local'
    },

    footer: {
      message: 'Overtone — Claude Code Plugin',
      copyright: '2026'
    }
  }
})
