import { describe, expect, it, vi } from "vitest";
import { runMenu, type MenuIO } from "../../src/terminal/menu.js";
import { collectorArguments, type CollectorCommand } from "../../src/terminal/commands.js";

function fakeIO(answers: string[]): MenuIO & { messages: string[] } {
  const messages: string[] = [];
  return {
    messages,
    ask: (): Promise<string> => {
      const answer = answers.shift();
      if (answer === undefined) throw new Error("Unexpected question in test");
      return Promise.resolve(answer);
    },
    write: (message): void => { messages.push(message); },
    run: vi.fn< MenuIO["run"] >().mockResolvedValue(0),
  };
}

describe("terminal menu", () => {
  it("can exit without launching anything", async () => {
    const io = fakeIO(["0"]);
    await runMenu(io, process.cwd());
    expect(io.run).not.toHaveBeenCalled();
  });
  it("previews one Magnit task without starting a browser", async () => {
    const io = fakeIO(["1", "2", "1", "780019", "64247", "0"]);
    await runMenu(io, process.cwd());
    expect(io.messages.join("\n")).toContain("заданий: 1");
    expect(io.run).not.toHaveBeenCalled();
  });
  it("requires explicit confirmation after preview", async () => {
    const io = fakeIO(["3", "1", "780019", "64247", "", "0"]);
    await runMenu(io, process.cwd());
    expect(io.run).not.toHaveBeenCalled();
    expect(io.messages.join("\n")).toContain("отменён");
  });
  it("runs the selected chain only after confirmation", async () => {
    const io = fakeIO(["2", "1", "324K", "251C12891", "ДА", "0"]);
    await runMenu(io, process.cwd());
    expect(io.run).toHaveBeenCalledExactlyOnceWith({ chain: "pyaterochka", args: ["--store", "324K", "--category", "251C12891", "--headless"] });
  });
  it("rejects invalid input then returns to the menu", async () => {
    const io = fakeIO(["3", "1", "../bad", "64247", "0"]);
    await runMenu(io, process.cwd());
    expect(io.run).not.toHaveBeenCalled();
    expect(io.messages.join("\n")).toContain("Ошибка:");
  });
  it("does not create a schedule when displaying the guide", async () => {
    const io = fakeIO(["7", "0"]);
    await runMenu(io, process.cwd());
    expect(io.run).not.toHaveBeenCalled();
    expect(io.messages.join("\n")).toContain("Расписание не включено");
  });
  it("keeps paths with shell metacharacters as a single argument", () => {
    const command: CollectorCommand = { chain: "magnit", args: ["--stores-file", "C:/my files/a&b.json"] };
    const args = collectorArguments(command, process.cwd());
    expect(args.at(-1)).toBe("C:/my files/a&b.json");
    expect(args.slice(0, 2)).toEqual(["--import", "tsx"]);
  });
});
