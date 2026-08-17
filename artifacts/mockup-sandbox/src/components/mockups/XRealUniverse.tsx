export function XRealUniverse() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
        overflow: "hidden",
        background: "#05040b",
      }}
    >
      <iframe
        title="X Real Universe main menu"
        src={`${basePath}/xru/index.html`}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          border: 0,
        }}
      />
    </div>
  );
}