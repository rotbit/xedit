import type { CompareCopy, FreeCopy } from "./types";

/** Japanese copy for the free-scope and comparison sections; same facts and sources as zhPlans.ts */
export const jaPlans: { free: FreeCopy; compare: CompareCopy } = {
  free: {
    eyebrow: "無料の範囲",
    title: "どこまで無料か、先にはっきりと",
    note: "xEdit には現在有料プランはありません。コードは MIT ライセンスで公開しており、セルフホストもできます。以下が現在のルールと制限です。",
    tiers: [
      {
        label: "ログインなし",
        title: "開いてすぐ書ける",
        items: [
          "すべての編集機能：ライブプレビュー、スラッシュコマンド、[[リンク]]、タスクと「今日」",
          "ノートはこのブラウザ内、または開いたローカルフォルダに保存",
          "Markdown・HTML・PDF・長尺 PNG・Word で書き出し",
          "WeChat 公式アカウントと知乎へワンクリックでコピー（13 種類のテーマ）",
          "画像アップロード、共有リンク、クラウド同期にはログインが必要",
        ],
      },
      {
        label: "ログイン後 · 無料",
        title: "クラウド同期と共有",
        items: [
          "ノート、フォルダ、版の履歴、画像をクラウドに同期。Web 版と Mac 版で同じデータ",
          "ログインできる端末数に制限なし。オフラインでも書けて、再接続時に同期",
          "画像は 1 枚 10 MB まで、動画は 1 本 100 MB まで。アカウントごとにメディアの総容量があり、上限に達すると新規アップロードのみ停止（既存ファイルはそのまま）",
          "ノートごとに直近 100 版を保存し、それより古い版は自動で整理",
          "共有リンクと読者コメント",
        ],
      },
      {
        label: "AI",
        title: "費用は誰が負担するか",
        items: [
          "MCP 接続は無料。Claude などのクライアントを認可すると、クラウド上のノートを読み書きできます。クライアント自体の利用料や API 料金はその提供元とのご契約です",
          "MCP が読めるのはクラウド上のノートだけで、ブラウザ内やローカルフォルダのノートは対象外",
          "AI 校閲はベータ版で、アカウントごとに順次公開。1 日あたりの回数上限あり",
          "ベータ期間中の校閲モデル費用は xEdit が負担し、API キーは不要",
        ],
      },
    ],
    storageTitle: "3 つの保存方法",
    storageLabels: { where: "保存先", sync: "クラウド同期", fit: "向いている用途" },
    storage: [
      {
        name: "ブラウザ内",
        where: "ログインしない場合の既定。このブラウザ・この端末だけに保存され、サイトデータを消去すると一緒に消えます",
        sync: "ログインするとクラウドのアカウントへ自動でアップロード",
        fit: "試しに使う、ちょっとした下書き",
      },
      {
        name: "ローカルの Markdown フォルダ",
        where: "ログインせずに Chrome や Edge でパソコンのフォルダを開く。1 ノート = 1 つの .md ファイル",
        sync: "クラウドには同期されず、ログイン後もアップロードされません。バックアップはご自身の方法で（クラウドドライブ、Git など）",
        fit: "ファイルを自分のディスクに置き、他のエディタとも共有したい",
      },
      {
        name: "クラウド同期",
        where: "ログイン後はクラウドが正本で、端末にはオフライン用のコピーを保持",
        sync: "どの端末でも同じノート。版の履歴、画像、共有リンクはこの方式で使えます",
        fit: "Web 版と Mac 版、複数のパソコンを行き来する",
      },
    ],
  },

  compare: {
    eyebrow: "比較",
    title: "Obsidian・Notion と比べて、xEdit が向いている人",
    note: "xEdit は文章と個人ノートのための軽量な Markdown エディタで、両者の完全な代わりではありません。表は現在の実装どおりで、ないものは「なし」と書いています。",
    rowHead: "機能",
    rows: [
      { label: "価格とソース", xedit: "無料、MIT オープンソース", obsidian: "個人利用は無料、クローズドソース。公式 Sync は有料", notion: "無料プランあり、上位機能は有料。クローズドソース" },
      { label: "保存形式", xedit: "標準 Markdown のプレーンテキスト", obsidian: "ローカルの Markdown ファイル", notion: "クラウドのブロック構造。Markdown の入出力に対応" },
      { label: "Markdown 入出力", xedit: ".md 書き出しは原文そのまま。HTML・PDF・PNG・Word も", obsidian: "ファイル自体が .md", notion: "対応。複雑なページは書式が一部失われる" },
      { label: "ローカルファイル", xedit: "ローカルフォルダを開ける（Chrome / Edge）。クラウド同期の対象外", obsidian: "ネイティブのローカル保管庫", notion: "クラウド中心" },
      { label: "クラウド同期", xedit: "ログインすれば無料", obsidian: "公式 Sync は有料、または自前で用意", notion: "標準搭載" },
      { label: "インストール不要", xedit: "Web 版はブラウザですぐ使える。Mac 版もあり", obsidian: "デスクトップ／モバイルアプリが必要", notion: "Web 版と各プラットフォームのアプリ" },
      { label: "[[リンク]]", xedit: "対応。タイトル補完、名前変更時に参照も更新", obsidian: "対応", notion: "ページリンクと @ メンション" },
      { label: "バックリンクパネル", xedit: "未対応", obsidian: "あり", notion: "あり" },
      { label: "グラフビュー", xedit: "未対応", obsidian: "あり", notion: "なし" },
      { label: "データベース", xedit: "なし（通常の Markdown 表のみ）", obsidian: "Bases やプラグインで対応", notion: "中核機能" },
      { label: "プラグイン", xedit: "プラグイン機構なし。Obsidian のプラグインは使えません", obsidian: "豊富なコミュニティプラグイン", notion: "連携とテンプレート" },
      { label: "リアルタイム共同編集", xedit: "なし。共有リンクでコメントを集められます", obsidian: "なし", notion: "あり" },
      { label: "AI 連携", xedit: "MCP サーバー内蔵。認可した AI クライアントがノートを読み書き", obsidian: "コミュニティプラグイン経由", notion: "Notion AI と公式連携" },
      { label: "スマホアプリ", xedit: "未提供", obsidian: "iOS / Android", notion: "iOS / Android" },
    ],
    fitTitle: "xEdit が向いているのは",
    fit: [
      "記事、週報、読書メモを主に Markdown で書き、複雑な仕組みを作らずにライブプレビューを使いたい",
      "無料のクラウド同期とすぐ開ける Web 版がほしい、あるいは登録せず自分のフォルダにファイルを置きたい",
      "Claude などの AI クライアントに MCP 経由でノートを検索・整理・編集してほしい",
      "WeChat 公式アカウントや知乎に、書式を崩さずに貼り付けたい",
    ],
    otherTitle: "こんな場合は Obsidian や Notion がおすすめ",
    other: [
      "データベース、ボードビュー、チームでのリアルタイム共同編集が必要：Notion",
      "バックリンクパネル、グラフビュー、コミュニティプラグインが欠かせない：Obsidian",
      "主にスマホでメモを取る：どちらにもネイティブアプリがあります",
      "既存の Obsidian 保管庫がある：xEdit でフォルダを開いて .md は編集できますが、プラグイン・設定・キャンバスは反映されません",
    ],
    footnote: "Obsidian と Notion の情報は 2026 年 10 月時点の公開機能に基づきます。最新情報は各公式ドキュメントをご確認ください。",
  },
};
