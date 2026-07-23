import yfinance as yf
import pandas as pd
import time
import os

# Stocks to fetch
stocks = ["AAPL", "TSLA", "TCS.NS", "RELIANCE.NS", "HDFCBANK.NS"]
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
            else:
                clean_df["PRICE"] = df["Close"].values

            all_data.append(clean_df)
        else:
            print(f"⚠️ No data found for {ticker}. It may be delisted or inactive.")

    except Exception as e:
        print(f"❌ Failed to download {ticker}: {e}")

    time.sleep(1)

# Combine, Sort, and Save to data/ directory
if all_data:
    print("\nMerging and structuring data for the C++ Exchange Server...")

    final_df = pd.concat(all_data, ignore_index=True)
    final_df = final_df.sort_values(by="TIMESTAMP")

    # Save to data/ directory (relative to project root)
    output_path = os.path.join(os.path.dirname(__file__), "..", "data", "market_data1.csv")
    output_path = os.path.normpath(output_path)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    final_df.to_csv(output_path, index=False)

    total_rows = len(final_df)
    print(f"✅ Success! Saved {total_rows} chronological ticks to {output_path}.")
else:
    print("\n❌ Critical Failure: No data was fetched. Check your network.")