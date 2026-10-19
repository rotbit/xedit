/**
 * Content skeleton for the /themes page samples. It follows one structural convention:
 * headings are split into prefix / content / suffix spans (theme decorations must hang off real elements,
 * since pseudo-elements get lost when copied to WeChat), matching the HTML the editor actually produces.
 *
 * The only difference is that headings use div[data-h] instead of h1~h6: a sample is a "picture of text"
 * and shouldn't pollute the page outline. Styling comes from the rewritten selectors in themeStyles;
 * where real headings are needed (copying to WeChat), they're restored before export.
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

/** Full sample for the /themes page: lays out the common Markdown elements */
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
