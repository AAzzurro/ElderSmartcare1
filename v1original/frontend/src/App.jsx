import { useEffect, useState } from "react";
import { MobileShell } from "./ui";
import EntryPage from "./EntryPage";
import ElderApp from "./elder/ElderApp";
import NurseApp from "./nurse/NurseApp";

const ROLE = {
  entry: "entry",
  elder: "elder",
  nurse: "nurse",
};

export default function App() {
  const [role, setRole] = useState(() => {
    if (typeof window === "undefined") return ROLE.entry;
    const saved = window.localStorage.getItem("role");
    return saved === ROLE.elder || saved === ROLE.nurse ? saved : ROLE.entry;
  });

  useEffect(() => {
    if (role === ROLE.elder || role === ROLE.nurse) {
      try {
        window.localStorage.setItem("role", role);
      } catch {
        // ignore
      }
    }
  }, [role]);

  return (
    <MobileShell>
      {role === ROLE.entry ? (
        <EntryPage
          onElder={() => setRole(ROLE.elder)}
          onNurse={() => setRole(ROLE.nurse)}
        />
      ) : null}
      {role === ROLE.elder ? <ElderApp onBack={undefined} /> : null}
      {role === ROLE.nurse ? <NurseApp onBack={undefined} /> : null}
    </MobileShell>
  );
}