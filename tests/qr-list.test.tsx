// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QrList, type QrListRow } from "@/components/qr-list";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const ROWS: QrListRow[] = [
  {
    qrId: "QRA7K29X4P",
    status: "ACTIVE",
    type: "INSTAGRAM",
    destinationUrl: "https://instagram.com/corner",
    businessName: "Corner Shop",
    ownerName: "Asha Rao",
    mobile: "919876543210",
    merchantId: "651f0c9f0000000000000a1",
    createdAt: "2026-01-05T10:00:00.000Z",
    lastScannedAt: null,
    scanCount: 12,
  },
  {
    qrId: "QRB8X21M4K",
    status: "GENERATED",
    type: null,
    destinationUrl: null,
    businessName: null,
    ownerName: null,
    mobile: null,
    merchantId: null,
    createdAt: "2026-01-06T10:00:00.000Z",
    lastScannedAt: null,
    scanCount: 0,
  },
  {
    qrId: "QRC4P91N7W",
    status: "INACTIVE",
    type: "WHATSAPP",
    destinationUrl: "https://wa.me/919876543210",
    businessName: "Corner Shop",
    ownerName: "Asha Rao",
    mobile: "919876543210",
    merchantId: "651f0c9f0000000000000a1",
    createdAt: "2026-01-07T10:00:00.000Z",
    lastScannedAt: null,
    scanCount: 3,
  },
];

/** A different page of results, as the server would send after a filter change. */
const nextPage: QrListRow[] = [
  {
    qrId: "QRD5Q02R8Y",
    status: "GENERATED",
    type: null,
    destinationUrl: null,
    businessName: null,
    ownerName: null,
    mobile: null,
    merchantId: null,
    createdAt: "2026-01-08T10:00:00.000Z",
    lastScannedAt: null,
    scanCount: 0,
  },
];

const selectAll = () => screen.getByRole("checkbox", { name: "Select all QR codes on this page" }) as HTMLInputElement;
const rowBox = (qrId: string) => screen.getByRole("checkbox", { name: `Select ${qrId}` }) as HTMLInputElement;
const deleteButton = () => screen.getByRole("button", { name: "Delete Selected" });
const selected = () => screen.getByText(/\d+ QR(s)? selected/);
/** The dialog only exists while it is open, so the assertions check for null themselves. */
const dialog = () => screen.queryByRole("dialog") as HTMLElement;

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  refresh.mockClear();
  fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { deleted: 0 } }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderList = (rows: QrListRow[] = ROWS) => render(<QrList rows={rows} />);

describe("selecting QR codes", () => {
  it("starts empty, with the delete button disabled", () => {
    renderList();

    expect(selected().textContent).toContain("0 QR selected");
    expect(deleteButton().hasAttribute("disabled")).toBe(true);
    expect(selectAll().checked).toBe(false);
    expect(selectAll().indeterminate).toBe(false);
  });

  it("counts a single row and shows the header as partly selected", () => {
    renderList();

    fireEvent.click(rowBox("QRB8X21M4K"));

    expect(selected().textContent).toContain("1 QR selected");
    expect(rowBox("QRB8X21M4K").checked).toBe(true);
    expect(selectAll().checked).toBe(false);
    expect(selectAll().indeterminate).toBe(true);
    expect(deleteButton().hasAttribute("disabled")).toBe(false);
  });

  it("selects and clears every row on the page", () => {
    renderList();

    fireEvent.click(selectAll());

    expect(selected().textContent).toContain("3 QR selected");
    expect(selectAll().checked).toBe(true);
    expect(selectAll().indeterminate).toBe(false);
    for (const row of ROWS) expect(rowBox(row.qrId).checked).toBe(true);

    fireEvent.click(selectAll());

    expect(selected().textContent).toContain("0 QR selected");
    expect(selectAll().checked).toBe(false);
  });

  it("deselects one row again", () => {
    renderList();

    fireEvent.click(selectAll());
    fireEvent.click(rowBox("QRA7K29X4P"));

    expect(selected().textContent).toContain("2 QR selected");
    expect(rowBox("QRA7K29X4P").checked).toBe(false);
    expect(selectAll().indeterminate).toBe(true);
  });

  it("drops a selection when another page is loaded", () => {
    const view = renderList();

    fireEvent.click(selectAll());
    expect(selected().textContent).toContain("3 QR selected");

    // Next page: the rows are replaced, so the previous selection goes with them.
    view.rerender(<QrList rows={[nextPage[0]!]} />);

    expect(selected().textContent).toContain("0 QR selected");
    expect(rowBox(nextPage[0]!.qrId).checked).toBe(false);
    expect(deleteButton().hasAttribute("disabled")).toBe(true);
  });

  it("has nothing to select when the page is empty", () => {
    renderList([]);

    expect(selectAll().hasAttribute("disabled")).toBe(true);
    expect(deleteButton().hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("No QR codes left on this page")).toBeTruthy();
  });
});

describe("confirming a deletion", () => {
  it("asks first and says how many codes are going", () => {
    renderList();

    fireEvent.click(rowBox("QRA7K29X4P"));
    fireEvent.click(rowBox("QRC4P91N7W"));
    fireEvent.click(deleteButton());

    expect(dialog().textContent).toContain("Delete 2 QR codes?");
    expect(dialog().textContent).toContain("This action cannot be undone.");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the singular for a single code", () => {
    renderList();

    fireEvent.click(rowBox("QRB8X21M4K"));
    fireEvent.click(deleteButton());

    expect(dialog().textContent).toContain("Delete 1 QR code?");
  });

  it("warns when an active code is included", () => {
    renderList();

    fireEvent.click(rowBox("QRA7K29X4P"));
    fireEvent.click(deleteButton());

    expect(dialog().textContent).toContain("Some selected QR codes are active. Deleting them will permanently disable their existing links.");
  });

  it("says nothing about active codes when none are selected", () => {
    renderList();

    fireEvent.click(rowBox("QRB8X21M4K"));
    fireEvent.click(deleteButton());

    expect(dialog().textContent).not.toContain("permanently disable");
  });

  it("deletes nothing when the admin cancels", () => {
    renderList();

    fireEvent.click(selectAll());
    fireEvent.click(deleteButton());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(dialog()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(selected().textContent).toContain("3 QR selected");
  });
});

describe("deleting the selection", () => {
  it("sends only the selected IDs and reports the result", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { deleted: 2 } }));
    renderList();

    fireEvent.click(rowBox("QRA7K29X4P"));
    fireEvent.click(rowBox("QRC4P91N7W"));
    fireEvent.click(deleteButton());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/admin/qr");
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(init.body)).toEqual({ qrIds: ["QRA7K29X4P", "QRC4P91N7W"] });

    expect(dialog()).toBeNull();
    expect(screen.getByText("2 QR codes deleted successfully.")).toBeTruthy();
    expect(selected().textContent).toContain("0 QR selected");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("takes the deleted rows off the screen straight away", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { deleted: 3 } }));
    renderList();

    fireEvent.click(selectAll());
    fireEvent.click(deleteButton());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    });

    for (const row of ROWS) expect(screen.queryByRole("checkbox", { name: `Select ${row.qrId}` })).toBeNull();
    expect(screen.getByText("No QR codes left on this page")).toBeTruthy();
    expect(selectAll().hasAttribute("disabled")).toBe(true);
    expect(deleteButton().hasAttribute("disabled")).toBe(true);
  });

  it("keeps the rows and shows why when the server refuses", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: "VALIDATION_ERROR", message: "Please check the details you entered." } }, false, 400));
    renderList();

    fireEvent.click(selectAll());
    fireEvent.click(deleteButton());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    });

    expect(screen.getByRole("alert").textContent).toContain("Please check the details you entered.");
    expect(dialog()).not.toBeNull();
    expect(selected().textContent).toContain("3 QR selected");
    expect(refresh).not.toHaveBeenCalled();
    for (const row of ROWS) expect(screen.getByRole("checkbox", { name: `Select ${row.qrId}` })).toBeTruthy();
  });

  it("explains a network failure without pretending anything was deleted", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    renderList();

    fireEvent.click(selectAll());
    fireEvent.click(deleteButton());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    });

    expect(screen.getByRole("alert").textContent).toContain("Could not reach the server");
    expect(screen.queryByText(/deleted successfully/)).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("can be retried after a failure", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { message: "Please try again." } }, false, 500));
    renderList();

    fireEvent.click(rowBox("QRB8X21M4K"));
    fireEvent.click(deleteButton());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    });
    expect(screen.getByRole("alert")).toBeTruthy();

    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { deleted: 1 } }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    });

    expect(screen.getByText("1 QR code deleted successfully.")).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "Select QRB8X21M4K" })).toBeNull();
  });
});
