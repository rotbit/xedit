import { Suspense } from "react";
import { auth } from "@/auth";
import { Home } from "@/features/workspace/Home";
import { Landing } from "@/features/landing/Landing";

/**
 * 首页一身二任：未登录是产品落地页，登录后是工作台。
 *
 * 落地页在服务端整段渲染好再作为 prop 交给客户端的 Home——它是全站唯一要被搜索引擎
 * 读到的页面，不能像从前那样 ssr:false 动态加载（爬虫只会拿到一个空壳）。
 * 已登录的会话不会经过落地页，索性连渲染都省掉，首屏 HTML 只剩工作台。
 */
export default async function HomePage() {
  const session = await auth();
  const loggedIn = Boolean(session?.user);

  return (
    <Suspense>
      <Home landing={loggedIn ? null : <Landing />} />
    </Suspense>
  );
}
