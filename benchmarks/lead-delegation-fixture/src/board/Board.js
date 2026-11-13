export function Board(props) {
  const el = document.createElement("div");
  el.className = "board";
  el.textContent = props.title ?? "Board";
  return el;
}
