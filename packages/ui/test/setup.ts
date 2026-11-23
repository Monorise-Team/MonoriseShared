import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Bez globalnego afterEach Testing Library nie sprząta sama: każdy test zaczyna od pustego dokumentu.
afterEach(() => cleanup());
