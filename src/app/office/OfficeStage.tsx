"use client";

import { useEffect, useRef } from "react";
import { mountOffice, type OfficeHandle, type OfficeOptions } from "@/engine/office.js";

/**
 * エンジン(canvasとHUD)を1つの要素に載せるだけ。window を使うので OfficeClient が next/dynamic の ssr:false で読む。
 * make はマウントしたとき(ブラウザの中)に1回呼び、options だけ使う(初期状態・天気・マップは開いた時点のもの。あとの状態は handle.update で入れる)。dispose は外すとき
 */
export default function OfficeStage({
  make,
  onHandle,
}: {
  make: () => { options: OfficeOptions; dispose: () => void };
  onHandle: (handle: OfficeHandle | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const makeRef = useRef(make);

  useEffect(() => {
    const { options, dispose } = makeRef.current();
    const handle = mountOffice(ref.current!, options);
    onHandle(handle);
    return () => {
      onHandle(null);
      handle.destroy();
      dispose();
    };
  }, [onHandle]);

  return <div ref={ref} />;
}
