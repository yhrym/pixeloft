"use client";

import { useEffect, useRef } from "react";
import { mountOffice, type OfficeHandle, type OfficeOptions } from "@/engine/office.js";

/**
 * エンジン(canvasとHUD)を1つの要素に載せるだけ。window を使うので OfficeClient が next/dynamic の ssr:false で読む。
 * options はマウントしたときの値だけ使う(初期状態・天気・マップは開いた時点のもの。あとの状態は handle.update で入れる)
 */
export default function OfficeStage({
  options,
  onHandle,
}: {
  options: OfficeOptions;
  onHandle: (handle: OfficeHandle | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const optionsRef = useRef(options);

  useEffect(() => {
    const handle = mountOffice(ref.current!, optionsRef.current);
    onHandle(handle);
    return () => {
      onHandle(null);
      handle.destroy();
    };
  }, [onHandle]);

  return <div ref={ref} />;
}
