export type UserRole = "engineer" | "manager";

export type MockUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  title: string;
};

export const MOCK_USERS: readonly MockUser[] = [
  {
    id: "5",
    name: "Tushar Berad",
    email: "tushar.berad@mjbiopharm.com",
    role: "manager",
    title: "Manager QA, Drug product",
  },
  {
    id: "6",
    name: "Gautam",
    email: "gautam@mjbiopharm.com",
    role: "engineer",
    title: "Engineer",
  },
  {
    id: "7",
    name: "Test Engineer",
    email: "test.engineer@mjbiopharm.com",
    role: "engineer",
    title: "Test Engineer",
  },
  {
    id: "1",
    name: "Bhargav Patel",
    email: "bhargav@mjbiopharm.com",
    role: "engineer",
    title: "Quality Engineer - Packing",
  },
  {
    id: "3",
    name: "Priya Sharma",
    email: "priya@mjbiopharm.com",
    role: "engineer",
    title: "Process Engineer",
  },
  {
    id: "4",
    name: "Pankaj Birari",
    email: "pankaj.birari@mjbiopharm.com",
    role: "manager",
    title: "Head of Quality",
  },
] as const;
