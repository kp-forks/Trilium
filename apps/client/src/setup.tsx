import { render } from "preact";

async function main() {
    const bodyWrapper = document.createElement("div");
    render(<App />, bodyWrapper);
    document.body.appendChild(bodyWrapper);
}

function App() {
    return <p>Loading...</p>;
}

main();
