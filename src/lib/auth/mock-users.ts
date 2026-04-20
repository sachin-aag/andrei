export type UserRole = "engineer" | "manager";

export type MockUser = {
  id: string;
  name: string;
  email: string;
  employeeId: string;
  role: UserRole;
  title: string;
};

export const MOCK_USERS: readonly MockUser[] = [
  {
    id: "1",
    name: "Bhargav Patel",
    email: "bhargav@mjbiopharm.com",
    employeeId: "598",
    role: "engineer",
    title: "Quality Engineer - Packing",
  },
  {
    id: "2",
    name: "Rajesh Kumar",
    email: "rajesh@mjbiopharm.com",
    employeeId: "201",
    role: "manager",
    title: "Quality Assurance Manager",
  },
  {
    id: "3",
    name: "Priya Sharma",
    email: "priya@mjbiopharm.com",
    employeeId: "312",
    role: "engineer",
    title: "Process Engineer",
  },
  {
    id: "4",
    name: "Anil Deshmukh",
    email: "anil@mjbiopharm.com",
    employeeId: "105",
    role: "manager",
    title: "Head of Quality",
  },
] as const;

export function getUser(id: string | null | undefined): MockUser | undefined {
  if (!id) return undefined;
  return MOCK_USERS.find((u) => u.id === id);
}

export function getEngineers(): MockUser[] {
  return MOCK_USERS.filter((u) => u.role === "engineer");
}

export function getManagers(): MockUser[] {
  return MOCK_USERS.filter((u) => u.role === "manager");
}
