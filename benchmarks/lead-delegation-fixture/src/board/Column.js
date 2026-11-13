export function Column(props) {
  const el = document.createElement("div");
  el.className = "column";
  el.textContent = props.title ?? "Column";
  return el;
}
