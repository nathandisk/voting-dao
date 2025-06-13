import React, { useState } from "react";

// Declare Swal as a global variable.
// This is used to show sweet notifications (pop-ups) from the SweetAlert2 library.
declare const Swal: any;

// Define the expected property (props) type for the CreateProposal component.
// This component expects a single prop, `onCreate`, which is a function.
interface Props {
  onCreate: (
    title: string,
    description: string,
    mode: number, // 0 for Yes/No, 1 for Multiple Choice
    options: string[],
    duration: number // in seconds
  ) => void;
}

// This is the main React component for creating a new proposal.
// It receives `onCreate` as a prop to send the newly created proposal data to the parent component.
export default function CreateProposal({ onCreate }: Props) {
  // State to store the proposal title.
  const [title, setTitle] = useState("");
  // State to store the proposal description.
  const [description, setDescription] = useState("");
  // State to store the proposal type (0: Yes/No, 1: Multiple Choice).
  const [mode, setMode] = useState(0);
  // State to store the options if the proposal is of type Multiple Choice.
  const [options, setOptions] = useState(["", ""]);
  // State to store the proposal duration in seconds. Default is 120 seconds (2 minutes).
  const [duration, setDuration] = useState(120);

  // Function called when the "Create Proposal" button is clicked.
  const handleCreate = () => {
    // Validation: Ensure title and description are not empty.
    if (!title.trim() || !description.trim()) {
      // If empty, show a warning using SweetAlert.
      Swal.fire({
        icon: 'warning',
        title: 'Missing Information',
        text: 'Please fill in the proposal title and description.'
      });
      return; // Stop function execution.
    }

    // Check if proposal type is Multiple Choice.
    if (mode === 1) {
      // Filter options to remove empty ones (only spaces or not filled).
      const filteredOptions = options.filter((opt) => opt.trim() !== "");
      // Validation: Ensure at least 2 valid options.
      if (filteredOptions.length < 2) {
        // If fewer than 2, show an error message.
        Swal.fire({
          icon: 'error',
          title: 'Invalid Options',
          text: 'Multiple choice proposals must have at least 2 non-empty options.'
        });
        return; // Stop function execution.
      }
      // Call the `onCreate` function from props with multiple choice proposal data.
      onCreate(title, description, mode, filteredOptions, duration);
    } else {
      // If proposal type is Yes/No, call `onCreate` with default options ["Yes", "No"].
      onCreate(title, description, mode, ["Yes", "No"], duration);
    }
  };

  // Render the UI of the component.
  return (
    <div className="card">
      <h2>Create New Proposal</h2>

      {/* Form group for proposal title input */}
      <div className="form-group">
        <label htmlFor="title">Title</label>
        <input
          id="title"
          type="text"
          placeholder="Proposal Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      {/* Form group for proposal description input */}
      <div className="form-group">
        <label htmlFor="description">Description</label>
        <textarea
          id="description"
          placeholder="Describe your proposal"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {/* Form group to select proposal type */}
      <div className="form-group">
        <label htmlFor="type">Proposal Type</label>
        <select
          id="type"
          value={mode}
          onChange={(e) => setMode(Number(e.target.value))}
        >
          <option value={0}>Yes/No</option>
          <option value={1}>Multiple Choice</option>
        </select>
      </div>

      {/* This section is only displayed if the proposal type is "Multiple Choice" (mode === 1) */}
      {mode === 1 && (
        <div className="form-group">
          <label>Options</label>
          {/* Map through `options` array to create input fields for each option */}
          {options.map((opt, idx) => (
            <input
              key={idx} // Unique key for each element in the list, important for React performance
              type="text"
              placeholder={`Option #${idx + 1}`}
              value={opt}
              onChange={(e) => {
                // Update `options` state when input value changes
                const newOpts = [...options]; // Copy the old options array
                newOpts[idx] = e.target.value; // Change the value at the corresponding index
                setOptions(newOpts); // Set state with the new array
              }}
              style={{ marginBottom: "0.5rem" }}
            />
          ))}
          {/* Button to add a new option input field */}
          <button
            onClick={() => setOptions([...options, ""])} // Add an empty string to the `options` array
            type="button"
            className="btn btn-secondary"
          >
            + Add Option
          </button>
        </div>
      )}

      {/* Form group for proposal duration input */}
      <div className="form-group">
        <label htmlFor="duration">Duration (seconds)</label>
        <input
          id="duration"
          type="number"
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
        />
      </div>

      {/* Button to submit the form and create the proposal */}
      <button onClick={handleCreate} className="btn btn-primary">Create Proposal</button>
    </div>
  );
}
