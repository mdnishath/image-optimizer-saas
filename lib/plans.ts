export interface Plan {
  id: string; // Freemius plan ID
  name: string; // Display name
  credits: number;
  price: string;
}

export const plans: Plan[] = [
  {
    id: "34240", // Freemius plan ID
    name: "Optimizer 5K",
    credits: 5000,
    price: "$48 / year",
  },
  {
    id: "34242",
    name: "Optimizer 20K",
    credits: 20000,
    price: "$96 / year",
  },
  {
    id: "34243",
    name: "Optimizer 1M",
    credits: 1000000,
    price: "$156 / year",
  },
  {
    id: "34244",
    name: "Free",
    credits: 100,
    price: "Free",
  },
];
