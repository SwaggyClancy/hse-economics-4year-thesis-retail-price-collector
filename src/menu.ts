import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { runMenu } from "./terminal/menu.js";
import { runCollector } from "./terminal/commands.js";

async function main(): Promise<void> {
  if (!stdin.isTTY) throw new Error("Меню требует интерактивный терминал. Для скриптов используйте collect:magnit / collect:pyaterochka.");
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    await runMenu({
      ask: (question) => rl.question(question), write: (message) => console.log(message),
      run: async (command) => {
        rl.pause();
        try { return await runCollector(command, process.cwd()); } finally { rl.resume(); }
      },
    }, process.cwd());
  } finally { rl.close(); }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Ошибка меню"); process.exitCode = 1;
});
