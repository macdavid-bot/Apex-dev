export default function WorkflowTimeline({ steps = [] }) {
  return (
    <div>
      <h2>Workflow Timeline</h2>

      <ul>
        {steps.map((step, index) => (
          <li key={index}>
            <strong>{step.title}</strong>
            <p>{step.status}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
