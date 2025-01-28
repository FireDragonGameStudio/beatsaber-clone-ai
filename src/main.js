import "./style.css";
import { BeatSaberGame } from "./game";

document.querySelector("#app").innerHTML = `
  <div id="game-container">
  </div>
`;

const game = new BeatSaberGame();
