// Test-only NEP-171 receiver, compiled by sandbox-market.mjs. Never deployed to testnet.
#![no_std]
#[link(wasm_import_module = "env")]
unsafe extern "C" {
    #[cfg(not(claim))]
    fn value_return(len: u64, ptr: u64);
    #[cfg(claim)]
    fn predecessor_account_id(register: u64);
    #[cfg(claim)]
    fn register_len(register: u64) -> u64;
    #[cfg(claim)]
    fn read_register(register: u64, ptr: u64);
    #[cfg(claim)]
    fn promise_create(
        account_len: u64,
        account_ptr: u64,
        method_len: u64,
        method_ptr: u64,
        args_len: u64,
        args_ptr: u64,
        deposit_ptr: u64,
        gas: u64,
    ) -> u64;
    #[cfg(claim)]
    fn promise_return(id: u64);
}
#[unsafe(no_mangle)]
pub extern "C" fn nft_on_transfer() {
    #[cfg(claim)]
    unsafe {
        let mut registry = [0u8; 64];
        predecessor_account_id(0);
        let len = register_len(0);
        read_register(0, registry.as_mut_ptr() as u64);
        let method = b"request_claim";
        let args = br#"{"token_id":"rook","amount":"1"}"#;
        let zero = 0u128;
        let promise = promise_create(
            len,
            registry.as_ptr() as u64,
            method.len() as u64,
            method.as_ptr() as u64,
            args.len() as u64,
            args.as_ptr() as u64,
            &zero as *const u128 as u64,
            80_000_000_000_000,
        );
        promise_return(promise);
        return;
    }
    #[cfg(all(not(claim), accept))]
    let result: &[u8] = b"false";
    #[cfg(all(not(claim), not(accept)))]
    let result: &[u8] = b"true";
    #[cfg(not(claim))]
    unsafe {
        value_return(result.len() as u64, result.as_ptr() as u64);
    }
}
#[panic_handler]
fn panic(_: &core::panic::PanicInfo<'_>) -> ! {
    loop {}
}
