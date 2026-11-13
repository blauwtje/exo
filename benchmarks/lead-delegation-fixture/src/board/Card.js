export function Card(props) {
  const el = document.createElement("div");
  el.className = "card";
  el.textContent = props.title ?? "Card";
  return el;
}
