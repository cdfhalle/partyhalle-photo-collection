"use client";

// Submit button for the delete form that asks for confirmation first. Without
// JS it still submits (the server action handles the delete) — confirmation is
// a progressive enhancement.
export function FeedbackDeleteButton() {
  return (
    <button
      type="submit"
      onClick={(e) => {
        if (!window.confirm("Diese Nachricht wirklich löschen?")) e.preventDefault();
      }}
      className="text-sm font-medium text-red-600 underline dark:text-red-400"
    >
      Löschen
    </button>
  );
}
