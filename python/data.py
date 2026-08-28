import yfinance as yf
import pandas as pd
import time
import os

# Stocks to fetch
stocks = [
    "AAPL", "TSLA", "TCS.NS", "RELIANCE.NS", "HDFCBANK.NS",
    "GOOGL", "AMZN", "MSFT", "NVDA", "INFY.NS"
]
all_data = []

print("Initiating Historical Tick Download (1-Minute Intervals)...")
for ticker in stocks:
    print(f"Fetching {ticker}...")
    try:
        df = yf.download(ticker, period="7d", interval="1m", progress=False)

        if not df.empty:
            clean_df = pd.DataFrame()
            clean_df["TIMESTAMP"] = df.index
            clean_df["TICKER"] = ticker

            if isinstance(df.columns, pd.MultiIndex):
                clean_df["PRICE"] = df["Close"].iloc[:, 0].values
                clean_df["VOLUME"] = df["Volume"].iloc[:, 0].values
            else:
                clean_df["PRICE"] = df["Close"].values
                clean_df["VOLUME"] = df["Volume"].values

            # Drop rows where PRICE or VOLUME is NaN
            clean_df = clean_df.dropna(subset=["PRICE", "VOLUME"])
            # Convert volume to integer
            clean_df["VOLUME"] = clean_df["VOLUME"].astype(int)

            all_data.append(clean_df)
        else:
            print(f"  No data found for {ticker}. It may be delisted or inactive.")

    except Exception as e:
        print(f"  Failed to download {ticker}: {e}")

    time.sleep(1)

# Combine, Sort, and Save to data/ directory
if all_data:
    print("\nMerging and structuring data for the C++ Exchange Server...")
    final_df = pd.concat(all_data, ignore_index=True)
    final_df = final_df.sort_values(by="TIMESTAMP")

    # Build absolute path — avoids OSError 22 on Windows OneDrive paths with spaces
    script_dir = os.path.abspath(os.path.dirname(__file__))
    project_root = os.path.abspath(os.path.join(script_dir, ".."))
    data_dir = os.path.join(project_root, "data")
    output_path = os.path.join(data_dir, "market_data1.csv")
    os.makedirs(data_dir, exist_ok=True)
    # Write via open() with explicit encoding instead of passing the path string
    # directly to pandas — this bypasses the Windows codec/path issue
    with open(output_path, "w", newline="", encoding="utf-8") as f:
        final_df.to_csv(f, index=False)

    total_rows = len(final_df)
    print(f"Success! Saved {total_rows} chronological ticks to {output_path}.")
    print(f"Columns: {list(final_df.columns)}")
    print(final_df.head(3).to_string())
else:
    print("\nCritical Failure: No data was fetched. Check your network.")