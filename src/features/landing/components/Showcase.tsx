import { Check } from "lucide-react";
import type { ShowcasesCopy, ShowcaseText } from "../content/types";
import { AiMock, ShareMock, SyncMock } from "./mocksPlatform";
import { EditorMock, LinksMock, TasksMock } from "./mocksWriting";
import { Eyebrow, SHELL } from "./Section";

/**
 * In-depth showcases, one screen per headline capability, alternating copy and illustration sides.
 * Order follows a writer's day: write → link → plan → store → hand to AI → share; reordering breaks the narrative.
 */

/** A two-column row: copy on one side, illustration on the other. `reverse` swaps sides so consecutive rows alternate. */
function Row({
  text,
  reverse,
  children,
}: {
  text: ShowcaseText;
  reverse?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      id={text.id}
      className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16"
    >
      <div className={reverse ? "lg:order-2" : undefined}>
        <Eyebrow text={text.eyebrow} badge={text.badge} />
        <h2 className="mt-5 text-[clamp(22px,3vw,30px)] font-semibold leading-[1.35] tracking-[-0.02em]">
          {text.title}
        </h2>
        <p className="mt-4 text-[14.5px] leading-[1.85] text-[var(--ink-soft)]">{text.lead}</p>
        <ul className="mt-6 space-y-2.5">
          {text.points.map((p) => (
            <li key={p} className="flex gap-2.5 text-[13.5px] leading-6 text-[var(--ink-soft)]">
              <Check size={16} className="mt-0.5 shrink-0 text-[var(--brand)]" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={`min-w-0 ${reverse ? "lg:order-1" : ""}`}>{children}</div>
    </div>
  );
}

export function Showcases({ copy }: { copy: ShowcasesCopy }) {
  const { editor, links, tasks, sync, ai, share } = copy;
  return (
    <section className={`${SHELL} pb-24`}>
      <div className="space-y-20 sm:space-y-28">
        <Row text={editor}>
          <EditorMock m={editor.mock} />
        </Row>
        <Row text={links} reverse>
          <LinksMock m={links.mock} />
        </Row>
        <Row text={tasks}>
          <TasksMock m={tasks.mock} />
        </Row>
        <Row text={sync} reverse>
          <SyncMock m={sync.mock} />
        </Row>
        <Row text={ai}>
          <AiMock m={ai.mock} />
        </Row>
        <Row text={share} reverse>
          <ShareMock m={share.mock} />
        </Row>
      </div>
    </section>
  );
}
