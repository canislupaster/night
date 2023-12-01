import { CSSProperties } from "preact/compat";
import { useServer } from "..";

export function Game() {
  const ctx = useServer();
  
  const grid = <table className="border-collapse table-fixed bg-gradient-to-tr from-blue-400 via-red-500 to-green-400" >
    <tbody>
      {ctx.grid.map((row, i) => (
        <tr key={i} className="box-content h-2">
          {row.map((p, j) => {
            let st: CSSProperties = {};

            if (p==null) {
              st.border = "1px solid white"; st.backgroundColor="transparent";
            } else {
              let c = ctx.players[p]==undefined ? "black" : ctx.players[p].color;
              st.border = `1px solid gray`;
              st.backgroundColor=c;
            }

            return <td key={j} className="box-content h-4 w-4" style={st} ></td>;
          })}
        </tr>
      ))}
    </tbody>
  </table>;

  const psorted = Object.entries(ctx.players).sort((a,b) => b[1].points - a[1].points);

  const top = ["border-orange-500", "border-cyan-400", "border-green-500"], rest="slate-400";

  const leaderboard = psorted.map((p,i) => {
    const cls = `border border-2 ${i<top.length ? top[i] : rest} p-3`;

    return <div className="inline-flex drop-shadow-xl mx-2 items-center rounded shadow-lg text-white" style={{backgroundColor: p[1].color}} >
      <div className={`${cls} border-r-0 rounded-s`} ><span className=" mix-blend-difference" >{ p[1].name }</span></div>
      <div className={`${cls} rounded-e`} >{ p[1].points.toPrecision(2) }</div>
    </div>
  });

  return <div className="flex flex-col" >
    <div className="flex flex-row justify-center">
      <div>
        {grid}
      </div>

      <div className="bg-gray-300 self-stretch border-0 rounded w-0.5 mx-4" ></div>

      <div className="flex flex-wrap flex-col" >
        {leaderboard}
      </div>
    </div>
    <div className="flex flex-wrap pr-5 flex-col items-left justify-center my-4">
      <h4 className="text-2xl" >How to play</h4>
      <p>Use this <a href="https://replit.com/@Thomas_QM/HackNightGameTemplate" className="text-blue-400" >template</a> to start writing a script to play for you.</p>

      <h4 className="text-2xl mt-3" >Rules</h4>
      <ul className="text-xs" >
        <li>Each round, select a single cell to paint.</li>
        <li>If multiple players select the same cell, who gets it is chosen randomly.</li>
        <li>If the cell is already painted, each player only has a half chance of overwriting it.</li>
        <li>Closed curves drawn by the same player are filled in random order.</li>
        <li className="text-bold" >You win if you color all the cells.</li>
      </ul>
    </div>
  </div>;
}