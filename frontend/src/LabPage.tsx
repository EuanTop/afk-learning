import { PixelStoryStage } from "./PixelStoryStage";
import { IDLE_SCENE, IDLE_SHOWCASE } from "./story-presets";

export function LabPage() {
  return (
    <main className="min-h-[100dvh] bg-[radial-gradient(circle_at_top,#fdf7ec_0%,#f2e3c1_48%,#debf86_100%)] px-4 py-6 text-stone-900">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="space-y-3">
          <div className="inline-flex rounded-full border-4 border-stone-900 bg-[#fff1c9] px-4 py-2 text-xs font-black uppercase tracking-[0.24em] shadow-[4px_4px_0_0_#2b2118]">
            Pixel Lab
          </div>
          <h1 className="text-4xl font-black">像素调试子路由</h1>
          <p className="max-w-3xl text-base leading-8 text-stone-700">
            这个页面专门放像素角色、动作循环和技术调试，不会出现在幼儿入口首页。
          </p>
        </header>

        <section className="rounded-[2rem] border-4 border-stone-900 bg-[#fff8e8] p-4 shadow-[8px_8px_0_0_#2b2118]">
          <PixelStoryStage
            className="h-[72vh] w-full"
            scene={IDLE_SCENE}
            showcase={IDLE_SHOWCASE}
          />
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {IDLE_SHOWCASE.map((demo) => (
            <article
              key={demo.id}
              className="rounded-[1.6rem] border-4 border-stone-900 bg-[#fffdf6] p-5 shadow-[4px_4px_0_0_#2b2118]"
            >
              <div className="text-lg font-black">{demo.label}</div>
              <div className="mt-1 text-xs font-black uppercase tracking-[0.18em] text-stone-500">
                Motion: {demo.motion}
              </div>
              <p className="mt-3 text-sm leading-7 text-stone-700">{demo.caption}</p>
              <p className="mt-2 text-xs leading-6 text-stone-500">{demo.spritePrompt}</p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
