import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const uploadImage = {
  name: "kort.png",
  mimeType: "image/png",
  buffer: readFileSync(new URL("../web/public/icon-512.png", import.meta.url)),
};

async function scanWithCamera(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Fota framsidan" })).toBeVisible();
  const shutter = page.getByRole("button", { name: "Ta bild" });
  await expect(shutter).toBeEnabled({ timeout: 10_000 });
  await shutter.click();
  await expect(page.getByRole("heading", { name: "Fota baksidan (valfritt)" })).toBeVisible();
  await page.getByRole("button", { name: "Hoppa över – värdera nu" }).click();
  await expect(page.getByTestId("card-title")).toContainText("(DEMO)");
}

test("skannar ett kort med kameran, sparar det och tar bort det", async ({ page }) => {
  await scanWithCamera(page);

  await expect(page.getByTestId("value-mid")).toContainText("kr");
  await expect(page.getByText("Uppskattat värde")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Gradering", exact: true })).toBeVisible();
  await expect(page.getByText(/DEMO – påhittat kort/)).toBeVisible();

  await page.getByRole("button", { name: "Spara i samlingen" }).click();
  await expect(page.getByRole("button", { name: "Uppdatera värde" })).toBeVisible();

  await page.getByRole("navigation").getByRole("button", { name: "Samling" }).click();
  await expect(page.getByTestId("collection-total")).toContainText("kr");
  await expect(page.getByText("1 kort")).toBeVisible();

  const tile = page.locator(".card-tile");
  await expect(tile).toHaveCount(1);
  await tile.click();
  await expect(page.getByTestId("card-title")).toContainText("(DEMO)");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Ta bort" }).click();
  await expect(page.getByRole("heading", { name: "Samlingen är tom" })).toBeVisible();
});

test("värderar en uppladdad bild", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles(uploadImage);
  await expect(page.getByRole("heading", { name: "Fota baksidan (valfritt)" })).toBeVisible();
  await page.getByTestId("file-input").setInputFiles(uploadImage);
  await expect(page.getByTestId("card-title")).toBeVisible();
  // Both sides were sent – the image can be flipped.
  await expect(page.getByText(/tryck för att vända/)).toBeVisible();
});

test("rättar identifieringen och värderar om", async ({ page }) => {
  await scanWithCamera(page);
  const before = await page.getByTestId("value-mid").innerText();

  await page.getByRole("button", { name: "Rätta" }).click();
  await page.getByRole("textbox", { name: "Spelare" }).fill("Testspelare Rättad");
  await page.getByLabel("Numrering").fill("1/1");
  await page.getByLabel("Autograf").check();
  await page.getByRole("button", { name: "Värdera om" }).click();

  await expect(page.getByTestId("card-title")).toHaveText("Testspelare Rättad");
  await expect(page.getByText("Autograf", { exact: true })).toBeVisible();
  const after = await page.getByTestId("value-mid").innerText();
  const amount = (text: string) => Number(text.replace(/[^\d]/g, ""));
  expect(amount(after)).toBeGreaterThan(amount(before));
});

test("visar värden i vald valuta", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: "Inställningar" }).click();
  await expect(page.getByText("Demo (påhittade kort)")).toBeVisible();
  await page.getByLabel("Visa värden i").selectOption("EUR");

  await page.getByRole("navigation").getByRole("button", { name: "Skanna" }).click();
  await page.getByTestId("file-input").setInputFiles(uploadImage);
  await page.getByRole("button", { name: "Hoppa över – värdera nu" }).click();
  await expect(page.getByTestId("value-mid")).toContainText("€");
});

test("fungerar utan kamera via bilduppladdning", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("nej", "NotAllowedError"));
  });
  await page.goto("/");
  await expect(page.getByText(/Kameran är blockerad/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Ta bild" })).toBeDisabled();

  await page.getByTestId("file-input").setInputFiles(uploadImage);
  await page.getByRole("button", { name: "Hoppa över – värdera nu" }).click();
  await expect(page.getByTestId("value-mid")).toBeVisible();
});
