import React from "react";

// Define the structure (data type) for a proposal object.
// This ensures each proposal has consistent properties.
interface Proposal {
  id: number;       // Unique ID for each proposal
  title: string;    // Title of the proposal
  mode: number;     // Proposal mode (e.g., 0 for Yes/No, 1 for Multiple Choice)
  open: boolean;    // Proposal status: true if open, false if closed
  closes: number;   // Timestamp of when the proposal will close
  options: string[];// List of answer options if the mode is multiple choice
}

// Define the properties (props) that the ProposalList component will receive.
interface Props {
  // `proposals` is an array containing objects with the `Proposal` structure.
  proposals: Proposal[];
}

/**
 * The ProposalList component is a functional React component.
 * Its role is to display a list of proposals to the user interface (UI).
 * @param {Props} props - Properties passed to the component, containing the proposal list.
 * @returns {JSX.Element} - A JSX element that renders the proposal list.
 */
export default function ProposalList({ proposals }: Props) {
  // This component renders a div as the main wrapper.
  return (
    <div>
      {/* Title for the proposal list */}
      <h2>Proposals</h2>
      {/* Unordered list to hold each proposal item */}
      <ul>
        {/* Iterate over the `proposals` array using `map`.
            For each proposal object (`p`) in the array, create a list item (`li`). */}
        {proposals.map((p) => (
          // `key={p.id}` is a special React prop to uniquely identify each list item.
          <li key={p.id}>
            {/* Display the proposal title in bold text */}
            <b>{p.title}</b> — {/* Display the proposal mode based on its value */}
            {p.mode === 0 ? "Yes/No" : "Multiple Choice"}
            <br />
            {/* Show proposal status (Open/Closed) based on the `p.open` boolean */}
            Status: {p.open ? "Open" : "Closed"}
            <br />
            {/* Display answer options by joining the `p.options` array into a comma-separated string */}
            Options: {p.options.join(", ")}
          </li>
        ))}
      </ul>
    </div>
  );
}
