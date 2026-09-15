"use client";

import { useEffect, useRef, type DependencyList } from "react";
import { registerCommands, type Command } from "@/lib/commandRegistry";

/**
 * 把一组命令注册进全局注册表，组件卸载（或 deps 变化）时注销。
 *
 * run / when 一律经 ref 取当次渲染的那份闭包，所以 deps 只需要写「命令表本身变了没有」
 * （多数宿主是一张静态表，传 [] 即可），不必把回调里用到的十几个值全列进去——
 * 那样每次渲染都要注销再注册，不光浪费，批次还会被挪到列表末尾、打乱面板里的命令顺序。
 */
export function useRegisterCommands(cmds: Command[], deps: DependencyList) {
  const latest = useRef(cmds);
  // 每次渲染后同步最新闭包；注册 effect 声明在后面，deps 变化那一轮读到的已是新值
  useEffect(() => {
    latest.current = cmds;
  });

  useEffect(() => {
    // 注册进去的是一层壳：id / label / keys 取注册这一刻的值（命令表是静态的），
    // run 与 when 每次调用都按 id 回查最新那份，避免执行到过期的闭包
    const shell = latest.current.map((cmd) => {
      const current = () => latest.current.find((c) => c.id === cmd.id) ?? cmd;
      return {
        ...cmd,
        run: () => current().run(),
        when: cmd.when ? () => current().when?.() ?? true : undefined,
      };
    });
    return registerCommands(shell);
    // deps 由调用方给：它知道命令表什么时候真的变了
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
