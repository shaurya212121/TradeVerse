import zmq
import re

def get_socket():
    sock = zmq.Context().socket(zmq.REQ)
    sock.connect("tcp://127.0.0.1:5556")
    return sock

def send_cmd(sock, cmd):
    sock.send_string(cmd)
    return sock.recv_string()

sock = get_socket()
TEST_TICKER = "AAPL"

print("\n=== TEST: INPUT VALIDATION & EDGE CASES ===")

# 1. Zero Quantity
r_zero = send_cmd(sock, f"LIMIT_BUY:{TEST_TICKER}:0:150.00")
print(f"1. Zero Qty Check        -> {r_zero.strip()}")

# 2. Negative Quantity
r_neg = send_cmd(sock, f"LIMIT_BUY:{TEST_TICKER}:-10:150.00")
print(f"2. Negative Qty Check    -> {r_neg.strip()}")

# 3. Invalid Ticker
r_fake = send_cmd(sock, "LIMIT_BUY:FAKESTOCK:10:150.00")
print(f"3. Fake Ticker Check     -> {r_fake.strip()}")

# 4. Cancel Non-existent Order
r_fake_cancel = send_cmd(sock, "CANCEL_ORDER:99999999")
print(f"4. Fake Cancel Check     -> {r_fake_cancel.strip()}")

# 5. Double Cancel Test
r_real = send_cmd(sock, f"LIMIT_BUY:{TEST_TICKER}:10:1.00")
match = re.search(r"\(order #(\d+)\)", r_real)
if match:
    real_id = int(match.group(1))
    c1 = send_cmd(sock, f"CANCEL_ORDER:{real_id}")
    print(f"5. Double Cancel (Try 1) -> {c1.strip()}")
    
    c2 = send_cmd(sock, f"CANCEL_ORDER:{real_id}")
    print(f"6. Double Cancel (Try 2) -> {c2.strip()}")
else:
    print(f"❌ Could not place test order. Server replied: {r_real.strip()}")

print("\n(If all the checks above say ERROR or REJECTED—except for 'Double Cancel Try 1' which should be SUCCESS—then your server is officially Hacker-Proof! ✅)")