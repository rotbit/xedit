import type { LandingCopy } from "./types";
import { jaChrome } from "./jaChrome";
import { jaPlans } from "./jaPlans";
import { jaFaq } from "./jaFaq";

/**
 * Japanese landing copy, translated from zh.ts; keep claims in step with it (same honesty rule).
 * Mockup task tags use the English forms (@tomorrow, @daily) because the app doesn't parse Japanese date words.
 */
export const ja: LandingCopy = {
  lang: "ja",
  chrome: jaChrome,

  hero: {
    badge: "無料 · MIT ライセンスのオープンソース",
    titleLine1: "Obsidian のように手元に、",
    titleLine2Before: "Notion のように",
    titleMark: "書きやすく",
    titleLine2After: "。",
    sub: "その場でレンダリングされる Markdown エディタ。[[リンク]]でノートをつなぎ、スラッシュコマンドで好きなブロックを挿入。タスクは「Today」に自動で集まります。ノートはローカルフォルダに置いても、クラウドに同期しても OK。MCP を通じて AI が直接読み書きすることもできます。",
    macCta: "Mac アプリを入手",
    githubCta: "GitHub でソースを見る",
    note: "登録不要で、開いたらすぐ書けます。ノートはまずこのデバイスに保存され、ログインするとクラウドに自動で同期されます",
    stats: [
      { value: "0 円", label: "執筆機能はすべて無料" },
      { value: "MIT", label: "オープンソース" },
      { value: "MCP", label: "AI とネイティブ連携" },
    ],
    visualLabel: "PREVIEW",
    visualCaption: "書いたままの姿で見える。リンクもコールアウトもタスクも、編集画面でそのままレンダリング",
  },

  mockup: {
    windowTitle: "執筆ワークフロー",
    syncStatus: "同期済み",
    searchPlaceholder: "検索",
    today: "Today",
    todayCount: "3",
    foldersLabel: "フォルダ",
    folders: [
      { name: "読書メモ" },
      { name: "執筆", docs: ["執筆ワークフロー", "ネタ帳"] },
      { name: "週報" },
    ],
    activeDoc: "執筆ワークフロー",
    breadcrumb: "執筆",
    docTitle: "執筆ワークフロー",
    paraBefore: "下書きはすべてプレーンテキストの Markdown。関連するアイデアは ",
    wikiLink: "カード型ノート術",
    paraAfter: " のようにリンクでつなぎます。タイトルを変えても、そこへのリンクは自動で追従します。",
    calloutBadge: "ヒント",
    calloutText: "/ を押すとコマンドメニューが開きます。見出しも表もコールアウトも、記法を覚える必要はありません。",
    tasksHeading: "今週のタスク",
    tasks: [
      { text: "先週の読書メモを整理する", done: true },
      { text: "第3章の初稿を書き上げる", due: "tomorrow" },
      { text: "朝の執筆 1,000 字", due: "daily" },
    ],
    slashQuery: "/",
    slashItems: [
      { icon: "h2", label: "見出し 2", hint: "##" },
      { icon: "callout", label: "コールアウト", hint: "> [!tip]" },
      { icon: "todo", label: "タスクリスト", hint: "- [ ]" },
      { icon: "table", label: "表", hint: "|" },
      { icon: "code", label: "コードブロック", hint: "```" },
      { icon: "image", label: "画像", hint: "![]" },
    ],
    wordCount: "1,286 文字",
  },

  pillars: {
    srTitle: "xEdit の4つの柱：ローカルファースト、書きやすさ、AI ネイティブ、どこでも書ける",
    items: [
      {
        icon: "obsidian",
        kicker: "Obsidian のように",
        title: "プレーンテキストは、あなたのもの",
        desc: "ノートはすべて標準の Markdown。[[リンク]]でタイトル同士をつなげます。PC 上のフォルダをそのままライブラリにすることもできます。",
        tags: ["Markdown", "[[リンク]]", "ローカルフォルダ"],
      },
      {
        icon: "notion",
        kicker: "Notion のように",
        title: "記法を覚えなくても書ける",
        desc: "/ でコマンドメニューを開けば、コールアウトも表もタスクもすぐ挿入。ノートやフォルダはドラッグで整理できます。",
        tags: ["スラッシュコマンド", "コールアウト", "ドラッグで整理"],
      },
      {
        icon: "ai",
        kicker: "AI ネイティブ",
        title: "AI をライブラリに招き入れる",
        desc: "MCP サーバーを内蔵。Claude などのクライアントを認可すれば、ノートの検索・作成・書き換えができます。書き終えた文章の表現を AI にチェックしてもらうことも。",
        tags: ["MCP", "AI 校閲"],
      },
      {
        icon: "devices",
        kicker: "どこでも書ける",
        title: "どこで開いても、同じノート",
        desc: "Web 版と Mac アプリで同じアカウントを使えます。オフラインでも書き続けられ、オンラインに戻れば自動で同期します。",
        tags: ["Web", "Mac", "オフライン", "クラウド同期"],
      },
    ],
  },

  showcases: {
    editor: {
      id: "editor",
      eyebrow: "エディタ",
      title: "書くのは Markdown、見えるのは整った文章",
      lead: "開けば一枚の紙。ボタンだらけのツールバーも、記号で埋まった画面もありません。見出し・太字・リスト・コード・画像・数式は編集画面でその場でレンダリングされ、Markdown のソースが見えるのはカーソルのある行だけ。Obsidian や Typora と同じ感覚で書けます。",
      points: [
        "ライブプレビューと「左にソース、右にプレビュー」の分割表示をいつでも切り替え",
        "/ でスラッシュメニュー：見出し、コールアウト、表、タスク、コードブロック、画像、動画",
        "Obsidian 風のコールアウト > [!tip]、YAML frontmatter、脚注、インライン数式とブロック数式",
        "括弧などのペア補完、見出しの折りたたみ、表の中でも Enter と Tab が快適。ライト / ダークの2テーマ",
      ],
      mock: {
        title: "ネタ帳",
        status: "保存済み",
        heading: "来週書きたい3つのテーマ",
        body: "テーマ選びの基準はひとつだけ。",
        strong: "自分が本当に読みたいかどうか",
        quote: "まず一人のために書き、それから皆のために書く。",
        items: ["ローカルファーストは何を解決するのか", "わたしの週報テンプレート"],
      },
    },
    links: {
      id: "links",
      eyebrow: "リンクとライブラリ",
      title: "[[リンク]]で、散らばったノートを一枚の網に",
      lead: "[[ と入力すると、ライブラリ内のノートをタイトルで補完。選べばリンクが挿入され、クリックでジャンプできます。リンクは Obsidian と同じくタイトルで解決されるので、.md で書き出して別のツールに移っても通用します。ノートの名前を変えると、そこを指す [[旧タイトル]] もまとめて新しいタイトルに更新され、リンク切れが残りません。",
      points: [
        "[[ でタイトル補完。[[タイトル|別名]] の書き方にも対応",
        "名前を変えると、ほかのノートからの参照も自動で更新",
        "多階層のフォルダツリー。ノートもフォルダもドラッグで移動",
        "全体検索と右クリックメニュー。削除したノートはゴミ箱から戻せます",
      ],
      mock: {
        query: "カード",
        suggestions: [
          { title: "カード型ノート術", folder: "読書メモ" },
          { title: "カードから生まれた企画", folder: "執筆" },
          { title: "カードを書く3つの習慣", folder: "読書メモ" },
        ],
        renameFrom: "カード型ノート術",
        renameTo: "カード型ノートで書く技術",
        renameNote: "3件のノートのリンクを更新しました",
      },
    },
    tasks: {
      id: "tasks",
      eyebrow: "タスクと Today",
      title: "タスクは本文に書く。まとめるのは「Today」",
      lead: "どのノートでも - [ ] と書けばタスクになります。行末に @tomorrow や @10/20、日付の範囲を添えれば期日つきに、@daily を付ければ毎日の繰り返しに。ライブラリ中の期日つきタスクはサイドバーの「Today」に自動で集まり、今日やること、これからの予定、最近書いていたノートがひと目でわかります。",
      points: [
        "日付タグは本文の中にあるので、書き出しても同期しても、デバイスを替えてもノートと一緒に移動",
        "@today / @tomorrow、@10/20、@2026-10-20、@開始日~終了日 の範囲指定に対応",
        "@daily の繰り返しタスクは、チェックしてもその日の完了として一度だけ記録",
        "「Today」でチェックすると、元のノートの該当行にも反映",
      ],
      mock: {
        title: "Today",
        date: "10月19日（月）",
        groups: [
          {
            label: "今日",
            items: [
              { text: "朝の執筆 1,000 字", doc: "執筆ワークフロー", tag: "daily" },
              { text: "編集者の修正依頼に返信する", doc: "ネタ帳", done: true },
            ],
          },
          {
            label: "今後の予定",
            items: [
              { text: "第3章の初稿を書き上げる", doc: "執筆ワークフロー", tag: "tomorrow" },
              { text: "四半期のまとめを提出", doc: "週報", tag: "10/24" },
            ],
          },
        ],
        source: "- [ ] 第3章の初稿を書き上げる @tomorrow",
      },
    },
    sync: {
      id: "sync",
      eyebrow: "ローカルとクラウド",
      title: "自分のフォルダに置くか、クラウドで同期するか",
      lead: "ログインしなければ、ノートはこのデバイスに保存されます。Chrome や Edge なら、PC 上のフォルダをそのままライブラリとして開くことも可能。ノート1件が .md ファイル1つなので、ほかのエディタで開いても同じです。ログインすると、ノート・フォルダ・バージョン履歴がクラウドに同期され、Web 版でも Mac アプリでも別の PC でも同じ内容に。オフラインでも書き続けられ、オンラインに戻れば自動で同期します。",
      points: [
        "ローカルフォルダモードは Chromium 系ブラウザが必要。ノートはそのフォルダにだけ保存され、クラウドには上がりません",
        "ログイン後はクラウドが正本。端末にはオフライン用のコピーが残り、ネットがなくても開いて編集できます",
        "バージョン履歴：自動スナップショットと手動保存、行ごとの差分表示、ワンクリックで復元",
        "復元の前には現在の原稿を自動でバックアップ。押し間違えても安心です",
      ],
      mock: {
        localTitle: "ローカルフォルダ",
        localPath: "~/Documents/Notes",
        localFiles: ["執筆ワークフロー.md", "ネタ帳.md", "読書メモ/"],
        localNote: "どのエディタで開いてもプレーンテキスト",
        cloudTitle: "クラウド同期",
        cloudLines: ["Web 版 · 同期済み", "Mac アプリ · 同期済み", "オフライン中の変更はまず端末に保存"],
        historyTitle: "バージョン履歴",
        versions: [
          { label: "現在", time: "たった今" },
          { label: "自動スナップショット", time: "今日 09:41" },
          { label: "手動保存 · 初稿", time: "昨日 22:10" },
        ],
        diffRemoved: "下書きはすべて1つのファイルにまとめている。",
        diffAdded: "下書きはすべてプレーンテキストの Markdown。",
        restore: "このバージョンに戻す",
      },
    },
    ai: {
      id: "ai",
      eyebrow: "AI",
      title: "AI がライブラリを読み書きし、表現もチェックする",
      lead: "xEdit は MCP サーバーを内蔵し、セルフホストの OAuth 2.1 で認可します。Claude などの AI クライアントに xEdit を追加して認可すれば、ノートの一覧・検索・作成・編集や、画像ライブラリの読み書きができるようになります。認可は設定画面からいつでも取り消せます。書き終えたら「AI Review」を押せば、AI が全文を読み、文法の誤りや冗長な表現を洗い出して、該当する文に直接コメントを付けます。",
      badge: "校閲はベータ版",
      points: [
        "MCP は動的クライアント登録と PKCE に対応。標準的な AI クライアントならすぐ接続できます",
        "AI が読み書きできるのは認可したアカウントの範囲だけ。設定からいつでも取り消せます",
        "表現の校閲：文法の誤り、冗長さ、不適切な言葉選び、論理の飛躍を指摘し、修正案も提示",
        "ワンクリックで採用または無視、⌘Z で取り消し可能。校閲のたびに記録が残り、あとから見返せます",
      ],
      mock: {
        clientName: "Claude",
        prompt: "今週の読書メモを週報にまとめて、「週報」フォルダに保存して",
        toolCalls: ["search_documents · 読書メモ", "get_document × 3", "create_document · 週報"],
        reply: "「第42週 読書週報」を作成し、3件のメモの要点をまとめました。",
        reviewTag: "表現",
        reviewQuote: "全面的な最適化を行うことを実施しました",
        reviewAdvice: "「〜を行うことを実施しました」は冗長な言い回しです。動詞で言い切るとすっきりします。",
        reviewFix: "全面的に最適化しました",
        accept: "採用",
        ignore: "無視",
      },
    },
    share: {
      id: "share",
      eyebrow: "共有と書き出し",
      title: "リンクを送って意見をもらい、好きな形式で書き出す",
      lead: "どのノートからも共有リンクを作れます。読む人は登録不要ですぐ読めて、テキスト・画像・動画を選択してコメントを付けられます。返信は共有ページ上でそのまま。仕上がった原稿は Markdown、HTML、PDF、縦長画像の PNG、Word に書き出せます。Word は見出しの階層・リスト・表・画像を保ったまま、飛書（Feishu）にそのまま取り込めます。",
      points: [
        "コメントはいつでもオフにでき、読む人には本文が広く表示されます",
        "共有リンクはいつでも手動で無効にできます",
        "Word 書き出しは構造を保つので、Feishu などのオンライン文書への取り込みに便利",
        "Markdown の書き出しは書いたままの原文。気軽に持ち出せます",
      ],
      mock: {
        url: "xedit.me/s/7Kq2",
        excerpt: "下書きはすべてプレーンテキストの Markdown なので、",
        highlighted: "どのツールでも開けます",
        comment: { author: "林", text: "ここに具体例があるとわかりやすいかも？" },
        reply: { author: "著者", text: "了解です。移行したときの話を足しますね。" },
        exportLabel: "書き出し",
        formats: ["Markdown", "HTML", "PDF", "縦長 PNG", "Word"],
      },
    },
  },

  features: {
    eyebrow: "すべての機能",
    title: "書く・整理する・同期する・AI。ひとつのエディタにそろっています",
    note: "ここに並んでいるのは、どれも今すぐ使える機能です。まだないもの（データベースやグラフビューなど）は載せていません。",
    groups: [
      {
        band: "書く",
        note: "ツールに邪魔されずに書く",
        items: [
          {
            icon: "pen",
            title: "ライブプレビュー Markdown",
            desc: "Obsidian 風の Live Preview。ソースが見えるのはカーソルのある行だけ。左右分割のプレビュー表示にも切り替えられます。",
          },
          {
            icon: "slash",
            title: "スラッシュコマンド",
            desc: "/ でメニューを開き、見出し・表・リスト・画像をワンタッチで挿入。メニューは英語・中国語（ピンイン可）で検索できます。",
          },
          {
            icon: "callout",
            title: "コールアウト",
            desc: "Obsidian 風の > [!tip]、> [!warning] など10種類近く。編集画面でそのまま色付きのブロックとして表示されます。",
          },
          {
            icon: "frontmatter",
            title: "Frontmatter と脚注",
            desc: "YAML frontmatter はプロパティ欄として表示。脚注、見出しの折りたたみ、ペア補完もそろっています。",
          },
          {
            icon: "sigma",
            title: "数式とコード",
            desc: "インライン・ブロックの LaTeX 数式は MathJax でレンダリング。コードブロックはシンタックスハイライト付き。",
          },
          {
            icon: "image",
            title: "画像と動画",
            desc: "ログインすれば、スクリーンショットは貼り付け、ファイルはドラッグするだけで自動アップロードしてその場に挿入。画像ライブラリでまとめて管理できます。",
          },
        ],
      },
      {
        band: "整理する",
        note: "ノートが増えても見つかる",
        items: [
          {
            icon: "link",
            title: "[[リンク]]",
            desc: "タイトルでノート同士を参照。[[ で自動補完、名前を変えればほかのノートのリンクもまとめて更新。",
          },
          {
            icon: "tasks",
            title: "タスクと「Today」",
            desc: "本文の - [ ] に @tomorrow や @daily などのタグを付けると、今日と今後のタスクとして自動で集約されます。",
          },
          {
            icon: "folder",
            title: "フォルダツリーとゴミ箱",
            desc: "多階層のフォルダ。ノートもフォルダもドラッグで移動、右クリックメニュー付き。削除してもゴミ箱から戻せます。",
          },
          {
            icon: "search",
            title: "全体検索",
            desc: "⌘O でノートをすばやく切り替え。タイトルと本文からライブラリ全体を検索できます。",
          },
        ],
      },
      {
        band: "同期と共同作業",
        note: "ノートはいつでもそこにある",
        items: [
          {
            icon: "vault",
            title: "ローカルフォルダをライブラリに",
            desc: "Chrome や Edge なら PC 上のフォルダを開けます。ノート1件が .md ファイル1つ。",
          },
          {
            icon: "cloud",
            title: "クラウド同期",
            desc: "ログインすると、ノート・フォルダ・バージョン・画像をクラウドに保存。Web 版でも Mac アプリでも同じ内容です。",
          },
          {
            icon: "offline",
            title: "オフライン対応",
            desc: "ログインしなくても書けます。ログイン中にネットが切れても書き続けられ、変更は端末に保存、オンラインに戻れば自動で同期。",
          },
          {
            icon: "history",
            title: "バージョン履歴と復元",
            desc: "自動スナップショットと手動保存、行ごとの差分、ワンクリック復元。復元前には現在の原稿を自動でバックアップします。",
          },
          {
            icon: "share",
            title: "共有リンクとコメント",
            desc: "読む人はログインなしで閲覧でき、テキスト・画像・動画を選んでコメント可能。あなたはそのまま返信できます。",
          },
          {
            icon: "export",
            title: "5つの書き出し形式",
            desc: "Markdown、HTML、PDF、縦長画像の PNG、そして構造をそのまま保ち Feishu にも取り込める Word。",
          },
          {
            icon: "palette",
            title: "WeChat へワンクリックでコピー",
            desc: "13 種類のレイアウトテーマ。コピー時にスタイルを各タグへインライン化するので、WeChat 公式アカウントや知乎に貼っても崩れません。",
          },
        ],
      },
      {
        band: "AI",
        note: "AI に手伝わせても、決めるのはあなた",
        items: [
          {
            icon: "plug",
            title: "MCP で AI クライアントと連携",
            desc: "MCP サーバーと OAuth 2.1 認可を内蔵。Claude などのクライアントがノートや画像を検索・作成・書き換えできます。",
          },
          {
            icon: "ai",
            title: "AI 表現チェック（ベータ）",
            desc: "全文を読んで文法の誤り・冗長さ・論理の飛躍を洗い出し、原文の該当箇所にコメント。ワンクリックで採用または無視。",
          },
        ],
      },
    ],
  },

  ...jaPlans,
  mac: {
    eyebrow: "デスクトップ",
    title: "Mac アプリで、執筆に専用のウィンドウを",
    note: "Web 版と同じアカウント、同じデータ。そのうえでデスクトップアプリならではの快適さを。一度ログインすればそのまま、ネイティブのメニューとショートカット、オフラインでも書けます。",
    bullets: [
      "ログイン状態を保持。再起動してもログインし直す必要はありません",
      "⌘N で新規ノート、⇧⌘H でワークスペースへ、⌘ +/- で拡大縮小",
      "ネイティブのメニューバー、ウィンドウサイズの記憶、単一インスタンスで起動",
      "オフラインになると自動でオフライン画面に切り替え、オンラインに戻れば同期を再開",
    ],
    cta: "Mac アプリを入手",
    requirement: "macOS 12+ · Apple Silicon",
    footnote: "インストーラーはコード署名されていません。初回は Finder でアイコンを右クリックし、「開く」を選んでください。Windows 版の専用アプリはまだありませんが、Web 版ですべての機能を使えます。",
    window: {
      folders: ["Today", "読書メモ", "執筆", "週報", "画像ライブラリ"],
      docs: [
        { title: "執筆ワークフロー", meta: "1,286 文字 · 今日" },
        { title: "ネタ帳", meta: "642 文字 · 昨日" },
        { title: "第42週 読書週報", meta: "1,905 文字 · 3日前" },
      ],
      keys: ["⌘N 新規", "⇧⌘H ワークスペース", "⌘+ 拡大"],
    },
  },

  faq: jaFaq,

  cta: {
    title: "次のノートは、ここから書きはじめよう",
    note: "登録不要で、開いたらすぐ書けます。気に入ったらログインすれば、ノートは自動でクラウドへ。",
  },

  footer: {
    blurb: "ライブプレビュー · [[リンク]] · タスク · ローカルフォルダかクラウド同期 · MCP",
    navAria: "フッターナビゲーション",
    links: [
      { href: "#editor", label: "Markdown エディタ" },
      { href: "#links", label: "リンクでつながるノート" },
      { href: "#tasks", label: "タスクと Today" },
      { href: "#sync", label: "ローカルとクラウド" },
      { href: "#ai", label: "AI と MCP" },
      { href: "#features", label: "すべての機能" },
      { href: "#free", label: "無料の範囲" },
      { href: "#compare", label: "Obsidian・Notion との比較" },
      { href: "#desktop", label: "Mac アプリ" },
      { href: "/changelog", label: "更新履歴" },
      { href: "#faq", label: "よくある質問" },
    ],
    github: "GitHub",
    feedback: "フィードバック・お問い合わせ",
    contactLead: "無料・オープンソースのローカルファースト Markdown エディタ · お問い合わせ：",
  },

  seo: {
    title: "xEdit · 無料・オープンソースの Markdown エディタ｜軽量な Notion・Obsidian 代替",
    description:
      "無料・MIT ライセンスのローカルファースト Markdown エディタ。ライブプレビュー、[[リンク]]、タスク集約、ローカルフォルダ／クラウド同期、MCP で AI 連携。Obsidian・Notion の代わりに。",
    keywords: [
      "Markdown エディタ", "マークダウン エディタ 無料", "ローカルファースト", "ノートアプリ",
      "Obsidian 代替", "Notion 代替", "ライブプレビュー", "双方向リンク", "オープンソース",
      "Mac ノートアプリ", "MCP", "xEdit",
    ],
  },
  jsonLd: {
    description:
      "xEdit は無料・オープンソースのローカルファースト Markdown エディタ。ライブプレビュー、[[リンク]]、タスク、ローカルフォルダまたはクラウド同期、MCP による AI 連携に対応。",
    appSubCategory: "Markdown エディタ・ノートアプリ",
    priceCurrency: "JPY",
  },
};
