// エディタのプレビュー枠(iframeの中身)
import { createRoot } from "react-dom/client";
import { PreviewFrame } from "../app/editor/preview/PreviewFrame";

createRoot(document.getElementById("root")!).render(<PreviewFrame locale={navigator.language.toLowerCase().startsWith("ja") ? "ja" : "en"} />);
