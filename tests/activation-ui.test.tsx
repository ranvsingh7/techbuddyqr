// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivationForm } from "@/components/activation-form";

/**
 * The activation screen is the first thing a customer sees, and the one place
 * where a stray celebration would look broken. These tests pin the behaviour
 * that matters: the form works exactly as before, and confetti appears only on
 * a successful activation.
 */

const VALID = {
  qrId: "QRA7K29X4P",
  mobile: "919876543210",
  ownerName: "Rajesh Kumar",
  businessName: "Raj Restaurant",
  type: "INSTAGRAM",
  destination: "https://instagram.com/rajrestaurant",
};

const SUCCESS = {
  data: {
    qrId: VALID.qrId,
    businessName: VALID.businessName,
    destinationUrl: "https://instagram.com/rajrestaurant",
    type: VALID.type,
    status: "ACTIVE",
  },
};

/** The confetti overlay is the only canvas on the page, so its presence is the signal. */
const confetti = () => document.querySelector("canvas");

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(jsonResponse(SUCCESS));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function fill() {
  fireEvent.change(screen.getByLabelText(/mobile number/i), { target: { value: VALID.mobile } });
  fireEvent.change(screen.getByLabelText(/business name/i), { target: { value: VALID.businessName } });
  fireEvent.change(screen.getByLabelText(/owner name/i), { target: { value: VALID.ownerName } });
  fireEvent.change(screen.getByLabelText(/card id/i), { target: { value: VALID.qrId } });
  fireEvent.change(screen.getByLabelText(/instagram url/i), { target: { value: VALID.destination } });
}

describe("activation form", () => {
  it("renders every field the activation API requires", () => {
    render(<ActivationForm />);

    for (const label of [/mobile number/i, /business name/i, /owner name/i, /card id/i]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    // All four real destination types are offered, from the shared constant.
    for (const option of [/instagram/i, /google review/i, /whatsapp/i, /custom url/i]) {
      expect(screen.getAllByLabelText(option).length).toBeGreaterThan(0);
    }
  });

  it("seeds the card ID when the page already read it from the URL", () => {
    render(<ActivationForm initialQrId="QRA7K29X4P" />);

    expect((screen.getByLabelText(/card id/i) as HTMLInputElement).value).toBe("QRA7K29X4P");
  });

  it("adapts the destination field to the chosen platform", () => {
    render(<ActivationForm />);

    fireEvent.click(screen.getByRole("radio", { name: /whatsapp/i }));
    expect(screen.getByLabelText(/whatsapp number/i)).toBeTruthy();
    expect((screen.getByLabelText(/whatsapp number/i) as HTMLInputElement).getAttribute("inputmode")).toBe("tel");

    fireEvent.click(screen.getByRole("radio", { name: /custom url/i }));
    expect(screen.getByLabelText(/custom url url/i)).toBeTruthy();
  });

  it("keeps submit disabled until a card ID is entered", () => {
    render(<ActivationForm />);
    const submit = screen.getByRole("button", { name: /activate card/i });

    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/card id/i), { target: { value: VALID.qrId } });
    expect((submit as HTMLButtonElement).disabled).toBe(false);
  });

  it("posts the same payload shape the API expects", async () => {
    render(<ActivationForm />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: /activate card/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]!;

    expect(url).toBe("/api/merchant/activate");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual(VALID);
  });

  it("shows field errors from the API next to the fields", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Please check the details you entered.",
            details: { mobile: "Enter a valid mobile number with country code" },
          },
        },
        400,
      ),
    );

    render(<ActivationForm />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: /activate card/i }));

    await waitFor(() => expect(screen.getAllByRole("alert").length).toBeGreaterThan(0));
    expect(screen.getByText(/check the details you entered/i)).toBeTruthy();
    expect(screen.getByText(/valid mobile number with country code/i)).toBeTruthy();
  });

  it("surfaces a friendly error state with a way back", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: "QR_ALREADY_ACTIVE", message: "This QR code is already activated." } }, 409));

    render(<ActivationForm />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: /activate card/i }));

    await waitFor(() => expect(screen.getByText(/already activated/i)).toBeTruthy());

    expect(screen.getByText(/couldn't activate your card/i)).toBeTruthy();
    const tryAgain = screen.getByRole("button", { name: /try again/i });

    // The error clears without discarding anything the customer typed.
    fireEvent.click(tryAgain);
    expect(screen.queryByText(/couldn't activate your card/i)).toBeNull();
    expect((screen.getByLabelText(/mobile number/i) as HTMLInputElement).value).toBe(VALID.mobile);
  });

  it("reports a network failure without exposing internals", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED 10.0.0.5:27017"));

    render(<ActivationForm />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: /activate card/i }));

    await waitFor(() => expect(screen.getByText(/could not reach the server/i)).toBeTruthy());
    expect(document.body.textContent).not.toMatch(/ECONNREFUSED|27017/);
  });
});

describe("celebration is tied to success alone", () => {
  it("shows no confetti on load", () => {
    render(<ActivationForm initialQrId="QRA7K29X4P" />);

    expect(confetti()).toBeNull();
  });

  it("shows no confetti when nothing has been submitted", async () => {
    render(<ActivationForm />);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(confetti()).toBeNull();
  });

  it("shows no confetti when validation fails", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: "VALIDATION_ERROR", message: "Please check the details you entered." } }, 400),
    );

    render(<ActivationForm />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: /activate card/i }));

    await waitFor(() => expect(screen.getAllByRole("alert").length).toBeGreaterThan(0));
    expect(confetti()).toBeNull();
    expect(screen.queryByText(/Your Card is Activated!/)).toBeNull();
  });

  it("shows no confetti on an API error", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: "QR_NOT_FOUND", message: "This QR code does not exist." } }, 404));

    render(<ActivationForm />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: /activate card/i }));

    await waitFor(() => expect(screen.getByText(/does not exist/i)).toBeTruthy());
    expect(confetti()).toBeNull();
  });

  it("celebrates exactly once the activation succeeds", async () => {
    render(<ActivationForm />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: /activate card/i }));

    await waitFor(() => expect(screen.getByText(/Your Card is Activated!/)).toBeTruthy());

    expect(confetti()).not.toBeNull();
    // The confirmed details from the response, not anything invented.
    expect(screen.getByText(VALID.businessName)).toBeTruthy();
    expect(screen.getByText(VALID.destination)).toBeTruthy();
    const link = screen.getByRole("link", { name: /open your page/i });
    expect(link.getAttribute("href")).toBe(VALID.destination);
  });

  it("returns to a blank form when activating a second card", async () => {
    render(<ActivationForm />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: /activate card/i }));
    await waitFor(() => expect(screen.getByText(/Your Card is Activated!/)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /activate another card/i }));

    expect(screen.queryByText(/Your Card is Activated!/)).toBeNull();
    expect(confetti()).toBeNull();
    expect((screen.getByLabelText(/card id/i) as HTMLInputElement).value).toBe("");
  });
});