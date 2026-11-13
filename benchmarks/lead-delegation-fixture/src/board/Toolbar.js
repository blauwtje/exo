export function Toolbar(props) {
  const el = document.createElement("div");
  el.className = "toolbar";
  el.textContent = props.title ?? "Toolbar";
  return el;
}
