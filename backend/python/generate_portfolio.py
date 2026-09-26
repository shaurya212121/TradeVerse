import pandas as pd
import numpy as np
import os

# Configuration
num_positions = 10000
tickers = ["AAPL", "TSLA", "TCS", "RELIANCE", "HDFCBANK"]
option_types = ["Call", "Put", "Stock"]

print("🎲 Generating 10,000 randomized hedge fund positions...")

# Generate randomized matrix data
data = {
    "TICKER": np.random.choice(tickers, num_positions),
    "POSITION_SIZE": np.random.randint(100, 5000, num_positions) * np.random.choice([-1, 1], num_positions),
    "STRIKE_PRICE": np.random.randint(200, 1500, num_positions),
    "EXPIRY_DAYS": np.random.randint(7, 90, num_positions),
    "OPTION_TYPE": np.random.choice(option_types, num_positions, p=[0.4, 0.4, 0.2])
}

portfolio_df = pd.DataFrame(data)
portfolio_df.loc[portfolio_df["OPTION_TYPE"] == "Stock", ["STRIKE_PRICE", "EXPIRY_DAYS"]] = 0

# Save to data/ directory
output_path = os.path.join(os.path.dirname(__file__), "..", "data", "portfolio.csv")
output_path = os.path.normpath(output_path)

os.makedirs(os.path.dirname(output_path), exist_ok=True)
portfolio_df.to_csv(output_path, index=False)

print(f"✅ Success! Created '{output_path}' with {num_positions} positions.")
print(portfolio_df.head())