export function Drawer(props) {
  const el = document.createElement("div");
  el.className = "drawer";
  el.textContent = props.title ?? "Drawer";
  return el;
}
