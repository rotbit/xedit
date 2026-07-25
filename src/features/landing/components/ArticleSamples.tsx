/**
 * 主题样张的内容骨架。三种体量共用一套结构约定：
 * 标题写成 prefix / content / suffix 三段 span（主题的装饰只能挂在真实元素上，
 * 伪元素复制到公众号会丢），与编辑器实际产出的 HTML 保持一致。
 *
 * 唯一的差别是标题用 div[data-h] 而不是 h1~h6：样张是「文字的图片」，
 * 不该混进页面大纲。样式由 themeStyles 里改写过的选择器负责，
 * 需要真标题的场合（复制到公众号）在导出前还原。
 */

function Heading({
  level,
  children,
}: {
  level: 1 | 2 | 3;
  children: React.ReactNode;
}) {
  return (
    <div data-h={level}>
      <span className="prefix" />
      <span className="content">{children}</span>
      <span className="suffix" />
    </div>
  );
}

/** 主视觉样机右栏：与左栏 Markdown 源码逐行对应 */
export function HeroArticle() {
  return (
    <>
      <Heading level={1}>三步发一篇公众号</Heading>
      <Heading level={2}>为什么样式不会丢</Heading>
      <p>
        <strong>复制之前</strong>，主题样式已经逐条内联到每个标签上。
      </p>
      <ul>
        <li>13 套排版主题，即点即换</li>
        <li>公式转成 SVG，公众号不变形</li>
        <li>图片粘贴即传图床</li>
      </ul>
      <blockquote>
        <p>打开就写，不登录也能用。</p>
      </blockquote>
    </>
  );
}

/** 主题墙缩略卡：只保留标题、正文、引用三种最能看出主题气质的元素 */
export function MiniArticle({ title }: { title: string }) {
  return (
    <>
      <Heading level={2}>{title}</Heading>
      <p>
        正文的样子，<strong>重点</strong>这样强调。
      </p>
      <blockquote>
        <p>引用块的样子</p>
      </blockquote>
    </>
  );
}

/** /themes 页的完整样张：把常用 Markdown 元素铺开 */
export function FullArticle({ name }: { name: string }) {
  return (
    <>
      <Heading level={1}>{name}｜标题一的样子</Heading>
      <p>
        这是一段正文。中文行距、字距与段间距由主题统一控制，
        <strong>加粗</strong>、<em>斜体</em>和
        <code>行内代码</code>各有自己的处理方式。
      </p>
      <Heading level={2}>标题二的样子</Heading>
      <p>换行、缩进与标点的挤压效果，在公众号里会与这里完全一致。</p>
      <ul>
        <li>无序列表的第一项</li>
        <li>无序列表的第二项</li>
      </ul>
      <Heading level={3}>标题三的样子</Heading>
      <ol>
        <li>有序列表的第一项</li>
        <li>有序列表的第二项</li>
      </ol>
      <blockquote>
        <p>引用块常用来放金句、注释或者一段转述。</p>
      </blockquote>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>元素</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>表格</td>
              <td>表头与边框跟随主题配色</td>
            </tr>
            <tr>
              <td>链接</td>
              <td>
                <a href="#themes">带下划线或彩色下边框</a>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <hr />
      <p>分割线之后，正文继续。</p>
    </>
  );
}
