// 分享页样式常量（从 SharedArticle 搬出）

/** 高亮与批注 UI 自身的样式（正文主题之外） */
export const ANNO_CSS = `
#nice .xe-anno { background-color: rgba(250, 173, 20, 0.24); border-bottom: 2px solid rgba(224, 152, 8, 0.8); cursor: pointer; }
#nice .xe-anno-active { background-color: rgba(250, 173, 20, 0.45); }
#nice img.xe-anno-media, #nice video.xe-anno-media { outline: 3px solid rgba(245, 166, 35, 0.65); outline-offset: 2px; }
#nice img.xe-anno-media { cursor: pointer; }
#nice img.xe-anno-active, #nice video.xe-anno-active { outline-color: rgba(224, 144, 8, 0.95); }
`;
