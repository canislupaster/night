export function EmojiMarquee({n}: {n: number}) {
  let emojis = ['🌝', '🌚', '🌛'];
  let arr = [];
  for (let i=0; i<n; i++) {
    arr.push(<span className="text-4xl mx-4"> {emojis[i%emojis.length]} </span>);
  }

  return <div className="relative flex overflow-x-hidden">
    <div className="py-4 animate-marquee whitespace-nowrap">{arr}</div>
    <div className="absolute top-0 py-4 animate-marquee2 whitespace-nowrap">{arr}</div>
  </div>;
}
